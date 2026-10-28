#!/usr/bin/env python3
"""Build the sculpted, anatomically detailed & rigged right hand for Bookln.

Run:
  blender -b --python scripts/build-hand.py

Source units are millimetres, matching the book/slipcase pipeline; the runtime
wraps the GLB in a 0.001 group.

Architecture:
1. Intrinsic (u, theta) multi-joint articulated finger & thumb lofts:
   Each digit is constructed as a continuous structured quad mesh along its
   smoothly corner-rounded skeletal spline (metacarpal -> MCP -> PIP -> DIP ->
   tip) with non-uniform axial ring clustering at the joints and nail beds.
   Because edge loops align 1:1 with the transverse knuckle axes, the multi-fold
   arcuate dorsal knuckle wrinkles, raised skin ridges, bicondylar joint flares,
   plump volar pads, palmar flexion creases, and recessed nail beds/cuticles are
   100% smooth and free of voxel bridges or decimate crinkles.
2. Seamless Voxel-Fused Palm, Thenar, Hypothenar, Webbing, Wrist & Forearm:
   The palm core, thumb-index first dorsal interosseous web, thenar/hypothenar
   eminences, wrist carpal bridge, and forearm are fused and smoothed into an
   organic anatomical base with palmar and wrist flexion creases.
3. Separate curved fingernail plates (`Hand_Nail`) with dedicated UVs sit
   snugly inside the recessed nail beds on all five digits.
4. A 22-bone hierarchical `HandArmature` (`forearm`, `wrist`, `palm`,
   `thumb_01..03`, `metacarpal_*`, `index/middle/ring/pinky_01..03`) is bound
   with branch-isolated analytical skin weights (`SkinnedMesh` in glTF).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "public" / "models"
SOURCE = MODELS / "source"
PREVIEW = Path("/tmp/bookln-hand")
SOURCE.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)

TARGET_PALM_TRIS = 2800


@dataclass
class BoneSpec:
    name: str
    parent: str | None
    head: Vector
    tail: Vector
    dorsal: Vector
    ra: float
    rb: float
    chain: str  # "arm", "palm", "thumb", "index", "middle", "ring", "pinky"


@dataclass
class NailSpec:
    chain: str
    bone_name: str
    knuckle: Vector
    tip: Vector
    dorsal: Vector
    radius_tip: float
    width_scale: float = 1.0


@dataclass
class DigitSpec:
    name: str
    points: list[Vector]  # [mc_base, mcp, pip, dip, tip] (5 points) or [cmc, mcp, ip, tip] (4 points for thumb)
    radii: list[float]    # matching length
    dorsals: list[Vector] # len(points) - 1 segment dorsal hints
    flexions: list[float] # joint flexion intensities at internal joints
    nail_width_scale: float = 0.90


def orthonormal_frame(axis: Vector, dorsal_hint: Vector) -> tuple[Vector, Vector, Vector]:
    """Return right-handed (tangent, dorsal, lateral) unit vectors where lateral = dorsal x tangent."""
    t = axis.normalized()
    d = (dorsal_hint - t * dorsal_hint.dot(t)).normalized()
    if d.length < 1e-5:
        fallback = Vector((0.0, 0.0, 1.0)) if abs(t.z) < 0.9 else Vector((1.0, 0.0, 0.0))
        d = (fallback - t * fallback.dot(t)).normalized()
    b = d.cross(t).normalized()
    return t, d, b


def smoothstep(x: float) -> float:
    t = max(0.0, min(1.0, x))
    return t * t * (3.0 - 2.0 * t)


def segment_distance(p: Vector, a: Vector, b: Vector) -> tuple[float, float]:
    """Return (distance, clamped_t) from point p to segment a->b."""
    ab = b - a
    len_sq = ab.length_squared
    if len_sq < 1e-8:
        return (p - a).length, 0.0
    t = max(0.0, min(1.0, (p - a).dot(ab) / len_sq))
    proj = a + ab * t
    return (p - proj).length, t


def ensure_outward_normals(obj: bpy.types.Object) -> None:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def evaluate_joint_chain(
    points: list[Vector],
    radii: list[float],
    dorsals: list[Vector],
    u: float,
) -> tuple[Vector, Vector, Vector, Vector, float, float]:
    """Evaluate smooth corner-rounded position, (tangent, dorsal, lateral), radius,
    and outer-bend knuckle peak factor along u in [0, N_segs]."""
    n_segs = len(points) - 1
    u_clamped = max(0.0, min(float(n_segs), u))
    seg_idx = min(n_segs - 1, int(math.floor(u_clamped)))
    local_t = u_clamped - seg_idx

    p_a = points[seg_idx]
    p_b = points[seg_idx + 1]
    pos = p_a.lerp(p_b, local_t)
    tang = (p_b - p_a).normalized()
    dors = dorsals[seg_idx].normalized()
    rad = radii[seg_idx] + (radii[seg_idx + 1] - radii[seg_idx]) * local_t
    bend_peak = 0.0

    # Smoothly round the corner at each internal joint k = 1 .. n_segs - 1
    for k in range(1, n_segs):
        du = u_clamped - float(k)
        band = 0.28
        if abs(du) < band:
            v_in = points[k] - points[k - 1]
            v_out = points[k + 1] - points[k]
            l_in = v_in.length
            l_out = v_out.length
            t_in = v_in.normalized()
            t_out = v_out.normalized()

            # Quadratic Bezier corner rounding between k - band and k + band
            alpha = (du + band) / (2.0 * band)  # 0..1 across the joint
            a_pt = points[k] - t_in * (band * l_in)
            b_pt = points[k]
            c_pt = points[k] + t_out * (band * l_out)

            oma = 1.0 - alpha
            bezier_pos = a_pt * (oma * oma) + b_pt * (2.0 * oma * alpha) + c_pt * (alpha * alpha)
            bezier_tan = (b_pt - a_pt) * (2.0 * oma) + (c_pt - b_pt) * (2.0 * alpha)

            w_corner = math.sin(math.pi * alpha) ** 1.2
            pos = pos.lerp(bezier_pos, w_corner)
            if bezier_tan.length > 1e-5:
                tang = bezier_tan.normalized()

            # Smoothly blend dorsal normal across the joint
            s_alpha = smoothstep(alpha)
            dors = dorsals[k - 1].lerp(dorsals[k], s_alpha).normalized()

            # Bony knuckle condyle pushes the dorsal peak outward at the bend
            cos_bend = max(-1.0, min(1.0, t_in.dot(t_out)))
            bend_angle = math.acos(cos_bend)
            bend_peak = (bend_angle / math.pi) * math.exp(-((du / 0.16) ** 2))
            break
        elif du >= band and k == seg_idx:
            # Ensure dorsal transitions smoothly along the shaft too
            if k < n_segs - 1:
                shaft_t = (local_t - band) / max(1e-3, 1.0 - 2.0 * band)
                if 0.0 < shaft_t < 1.0:
                    dors = dorsals[k].lerp(dorsals[k], 1.0).normalized()

    t_vec, d_vec, b_vec = orthonormal_frame(tang, dors)
    return pos, t_vec, d_vec, b_vec, rad, bend_peak


def build_digit_u_samples(n_segs: int) -> list[float]:
    """Generate non-uniform axial u samples in [0, n_segs], clustering dense rings
    across every knuckle joint (u = 1, 2, .. n_segs-1) and across the distal nail bed."""
    samples: set[float] = set()
    # Base shaft samples
    for i in range(n_segs * 6 + 1):
        samples.add(round(i / 6.0, 5))

    # High-density rings across each internal joint k = 1 .. n_segs - 1
    for k in range(1, n_segs):
        for j in range(-6, 7):
            u = k + j * 0.045
            if 0.02 < u < n_segs - 0.02:
                samples.add(round(u, 5))

    # High-density rings on the distal phalanx for cuticle rim & nail bed
    distal_start = float(n_segs - 1)
    for j in range(4, 38, 3):
        u = distal_start + j * 0.025
        if u < n_segs:
            samples.add(round(u, 5))

    return sorted(samples)


def create_articulated_digit(spec: DigitSpec, segments: int = 34) -> bpy.types.Object:
    """Build a continuous, multi-joint sculpted finger or thumb mesh in intrinsic (u, theta) space."""
    n_segs = len(spec.points) - 1
    u_Main = build_digit_u_samples(n_segs)

    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    uvs: list[tuple[float, float]] = []

    # Proximal pole cap
    p0, t0, d0, b0, r0, _ = evaluate_joint_chain(spec.points, spec.radii, spec.dorsals, 0.0)
    prox_pole = p0 - t0 * (r0 * 0.45)
    verts.append((prox_pole.x, prox_pole.y, prox_pole.z))

    # Build rings: proximal cap (3 rings) + u_Main + distal fingertip dome (7 rings)
    ring_params: list[tuple[float, float, float]] = []  # (u, cap_scale, axial_extra)
    for ic in range(1, 4):
        ang = (1.0 - ic / 4.0) * (math.pi * 0.46)
        ring_params.append((0.0, max(0.12, math.cos(ang)), -r0 * 0.45 * math.sin(ang)))

    for u in u_Main:
        ring_params.append((u, 1.0, 0.0))

    r_tip = spec.radii[-1]
    for ic in range(1, 7):
        ang = (ic / 7.0) * (math.pi * 0.48)
        ring_params.append(
            (
                float(n_segs),
                max(0.10, math.cos(ang) ** 0.76),
                r_tip * 0.62 * math.sin(ang),
            )
        )

    seg_lengths = [(spec.points[k + 1] - spec.points[k]).length for k in range(n_segs)]

    for u, cap_scale, axial_extra in ring_params:
        pos, t_vec, d_vec, b_vec, base_r, bend_peak = evaluate_joint_chain(
            spec.points, spec.radii, spec.dorsals, u
        )
        pos = pos + t_vec * axial_extra

        seg_idx = min(n_segs - 1, int(math.floor(max(0.0, u - 1e-5))))
        local_s = u - seg_idx
        is_distal = seg_idx == (n_segs - 1)
        is_mc = seg_idx == 0 and n_segs == 4

        # 1. Bicondylar joint widening & shaft waisting
        lat_flare = 1.0
        dorsal_crown = bend_peak * 0.22
        for k in range(1, n_segs):
            du_mm = (u - float(k)) * seg_lengths[min(seg_idx, len(seg_lengths) - 1)]
            joint_bell = math.exp(-((du_mm / 5.2) ** 2))
            lat_flare += (0.085 if k == 1 else 0.072) * joint_bell
            dorsal_crown += 0.065 * joint_bell
        if not is_mc:
            lat_flare -= 0.042 * math.sin(math.pi * local_s)

        # 2. Volar phalanx pad belly (fleshy finger pad between joints, pulp on distal tip)
        if is_distal:
            pulp_env = math.sin(math.pi * min(1.0, max(0.0, (local_s - 0.06) / 0.88))) ** 1.1
            volar_pad = 0.18 * pulp_env
        elif is_mc:
            volar_pad = 0.05 * math.sin(math.pi * local_s)
        else:
            volar_pad = 0.15 * (math.sin(math.pi * local_s) ** 1.15)

        for iseg in range(segments):
            theta = (2.0 * math.pi * iseg) / segments
            ct = math.cos(theta)  # lateral (-1 .. +1)
            st = math.sin(theta)  # dorsal (+1) .. volar (-1)
            lat_abs = abs(ct)

            rx = base_r * lat_flare * cap_scale
            if st >= 0.0:
                flat_factor = 0.78 + dorsal_crown * (0.65 + 0.35 * (ct * ct))
                if is_distal and local_s > 0.22:
                    nail_flat = math.sin(math.pi * min(1.0, (local_s - 0.22) / 0.74))
                    flat_factor -= 0.09 * nail_flat
                rz = base_r * flat_factor * cap_scale
                shape_mod = 1.0 + 0.055 * ((ct * ct) * (st * st))
            else:
                rz = base_r * (0.92 + volar_pad) * cap_scale
                shape_mod = 1.0 - 0.03 * (ct * ct)

            # 3. Intrinsic multi-fold dorsal knuckle wrinkles & volar flexion creases!
            # Evaluated directly on the ring (u, ct, st) -> 100% smooth & symmetric!
            radial_disp = 0.0
            axial_disp = 0.0
            for k in range(1, n_segs):
                flex = spec.flexions[k - 1]
                avg_len = 0.5 * (seg_lengths[k - 1] + seg_lengths[k])
                du_mm = (u - float(k)) * avg_len
                if abs(du_mm) > 12.0:
                    continue

                if k == 1 and n_segs == 4:
                    # MCP knuckle: 4 arcuate folds
                    grooves = [(-2.4, 0.38, 0.16), (-0.8, 0.56, 0.06), (0.8, 0.56, -0.06), (2.4, 0.38, -0.16)]
                    ridges = [(-1.6, 0.26), (0.0, 0.34), (1.6, 0.26)]
                    gw = 0.52
                else:
                    # PIP / DIP / Thumb IP knuckle: 5 crisp arcuate oval folds + skin ridges
                    grooves = [
                        (-2.8, 0.36, 0.26),
                        (-1.4, 0.68, 0.13),
                        (0.0, 0.82, 0.0),
                        (1.4, 0.68, -0.13),
                        (2.8, 0.36, -0.26),
                    ]
                    ridges = [(-2.1, 0.28), (-0.7, 0.42), (0.7, 0.42), (2.1, 0.28)]
                    gw = 0.44

                WR = 1.8
                grooves = [(a * WR, b, c * WR) for a, b, c in grooves]
                ridges = [(a * WR, b) for a, b in ridges]
                gw *= WR
                # Dorsal & upper-lateral wrinkle envelope
                if st > -0.22:
                    d_mask = smoothstep((st + 0.22) / 0.85) * (1.0 - 0.45 * (lat_abs**2.6)) * cap_scale
                    w_sum = 0.0
                    for g_off, g_dep, arc_k in grooves:
                        arc_shift = g_off + arc_k * (ct * ct) * base_r * 0.22
                        w_sum -= g_dep * math.exp(-(((du_mm - arc_shift) / gw) ** 2) * 2.0)
                    for r_off, r_ht in ridges:
                        w_sum += r_ht * math.exp(-(((du_mm - r_off) / (gw * 0.90)) ** 2) * 2.1)
                    radial_disp += w_sum * (0.65 + 0.45 * flex) * d_mask

                # Volar (palmar) joint flexion double-crease + inner crook tuck
                if st < -0.10:
                    v_mask = smoothstep((-st - 0.10) / 0.75) * (1.0 - 0.35 * (ct * ct)) * cap_scale
                    c1 = math.exp(-(((du_mm + 0.65) / 0.50) ** 2) * 2.2)
                    c2 = math.exp(-(((du_mm - 0.65) / 0.50) ** 2) * 2.2)
                    # Tuck inner joint slightly so flexed phalanges never self-intersect cleanly
                    crook_tuck = (0.85 * max(c1, c2 * 0.88) + 0.55 * math.exp(-((du_mm / 2.2) ** 2))) * flex
                    radial_disp -= crook_tuck * v_mask

            # 4. Nail bed recess & raised cuticle fold (eponychium / lateral nail walls) on distal segment
            if is_distal and axial_extra == 0.0 and st > 0.08:
                nail_u = abs(ct) / max(1e-3, 0.68 * spec.nail_width_scale)
                nail_v = (local_s - 0.32) / 0.60
                v_eff = nail_v - 0.14 * (nail_u * nail_u)
                d_cut_mask = smoothstep((st - 0.08) / 0.45)

                if -0.02 <= v_eff <= 1.02 and nail_u <= 1.04:
                    bed_m = smoothstep(min((v_eff + 0.02) / 0.12, (1.02 - v_eff) / 0.12, (1.04 - nail_u) / 0.16))
                    radial_disp -= 0.92 * bed_m * d_cut_mask

                cut_d = abs(v_eff + 0.05) / 0.10 if -0.18 <= v_eff < 0.07 and nail_u < 1.12 else 99.0
                lat_d = abs(nail_u - 1.07) / 0.13 if -0.04 <= v_eff <= 0.90 else 99.0
                rim_d = min(cut_d, lat_d)
                if rim_d < 1.6:
                    radial_disp += 0.44 * math.exp(-(rim_d * rim_d) * 1.9) * d_cut_mask

            out_dir = (b_vec * ct + d_vec * st).normalized()
            v_pos = (
                pos
                + b_vec * (rx * ct * shape_mod)
                + d_vec * (rz * st * shape_mod)
                + out_dir * radial_disp
                + t_vec * axial_disp
            )
            verts.append((v_pos.x, v_pos.y, v_pos.z))

    # Distal pole cap
    p_end, t_end, _, _, _, _ = evaluate_joint_chain(
        spec.points, spec.radii, spec.dorsals, float(n_segs)
    )
    dist_pole = p_end + t_end * (r_tip * 0.64)
    dist_pole_idx = len(verts)
    verts.append((dist_pole.x, dist_pole.y, dist_pole.z))

    # Proximal cap fan
    for iseg in range(segments):
        jn = (iseg + 1) % segments
        faces.append((0, 1 + jn, 1 + iseg))
        uvs.extend([(0.5, 0.0), (jn / segments, 0.02), (iseg / segments, 0.02)])

    # Quad strips
    n_rings = len(ring_params)
    for ir in range(n_rings - 1):
        row_a = 1 + ir * segments
        row_b = 1 + (ir + 1) * segments
        va = ir / max(1, n_rings - 1)
        vb = (ir + 1) / max(1, n_rings - 1)
        for iseg in range(segments):
            jn = (iseg + 1) % segments
            faces.append((row_a + iseg, row_a + jn, row_b + jn, row_b + iseg))
            uvs.extend(
                [
                    (iseg / segments, va),
                    ((iseg + 1) / segments, va),
                    ((iseg + 1) / segments, vb),
                    (iseg / segments, vb),
                ]
            )

    # Distal cap fan
    last_row = 1 + (n_rings - 1) * segments
    for iseg in range(segments):
        jn = (iseg + 1) % segments
        faces.append((last_row + iseg, last_row + jn, dist_pole_idx))
        uvs.extend([(iseg / segments, 0.98), (jn / segments, 0.98), (0.5, 1.0)])

    mesh = bpy.data.meshes.new(f"Digit_{spec.name}")
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for loop_idx, uv in enumerate(uvs):
        if loop_idx < len(uv_layer.data):
            uv_layer.data[loop_idx].uv = uv

    obj = bpy.data.objects.new(f"Digit_{spec.name}", mesh)
    bpy.context.collection.objects.link(obj)
    ensure_outward_normals(obj)
    return obj


def create_anatomical_phalanx(
    name: str,
    start: Vector,
    end: Vector,
    ra: float,
    rb: float,
    dorsal_hint: Vector,
    *,
    volar_belly: float = 0.08,
    dorsal_flat: float = 0.72,
    volar_flat: float = 0.72,
    rings: int = 28,
    segments: int = 36,
) -> bpy.types.Object:
    """Build a closed manifold lofted segment for forearm, wrist, and palm bridges."""
    axis = end - start
    length = axis.length
    t_vec, d_vec, b_vec = orthonormal_frame(axis, dorsal_hint)

    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []

    cap_steps = 5
    total_rings = cap_steps + rings + cap_steps

    prox_pole = start - t_vec * (ra * 0.45)
    verts.append((prox_pole.x, prox_pole.y, prox_pole.z))

    for ir in range(1, total_rings):
        if ir < cap_steps:
            u = ir / cap_steps
            angle = (1.0 - u) * (math.pi * 0.46)
            axial_offset = -ra * 0.44 * math.sin(angle)
            cap_scale = max(0.08, math.cos(angle))
            s = 0.0
        elif ir > cap_steps + rings:
            u = (ir - (cap_steps + rings)) / cap_steps
            angle = u * (math.pi * 0.46)
            axial_offset = length + rb * 0.44 * math.sin(angle)
            cap_scale = max(0.08, math.cos(angle))
            s = 1.0
        else:
            s = (ir - cap_steps) / rings
            axial_offset = s * length
            cap_scale = 1.0

        base_r = ra + (rb - ra) * s
        volar_pad = volar_belly * math.sin(math.pi * s)
        center = start + t_vec * axial_offset

        for iseg in range(segments):
            theta = (2.0 * math.pi * iseg) / segments
            ct = math.cos(theta)
            st = math.sin(theta)
            rx = base_r * cap_scale
            rz = base_r * (dorsal_flat if st >= 0.0 else (volar_flat + volar_pad)) * cap_scale
            pos = center + b_vec * (rx * ct) + d_vec * (rz * st)
            verts.append((pos.x, pos.y, pos.z))

    dist_pole = start + t_vec * (length + rb * 0.45)
    dist_pole_idx = len(verts)
    verts.append((dist_pole.x, dist_pole.y, dist_pole.z))

    for iseg in range(segments):
        jn = (iseg + 1) % segments
        faces.append((0, 1 + jn, 1 + iseg))

    ring_count = total_rings - 1
    for ir in range(ring_count - 1):
        row_a = 1 + ir * segments
        row_b = 1 + (ir + 1) * segments
        for iseg in range(segments):
            jn = (iseg + 1) % segments
            faces.append((row_a + iseg, row_a + jn, row_b + jn, row_b + iseg))

    last_row = 1 + (ring_count - 1) * segments
    for iseg in range(segments):
        jn = (iseg + 1) % segments
        faces.append((last_row + iseg, last_row + jn, dist_pole_idx))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    ensure_outward_normals(obj)
    return obj


def add_ellipsoid(
    name: str,
    location: tuple[float, float, float] | Vector,
    radii: tuple[float, float, float],
    rotation_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=40,
        ring_count=28,
        radius=1.0,
        location=location,
        rotation=rotation_euler,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = radii
    ensure_outward_normals(obj)
    return obj


def build_book_hand_scene() -> tuple[
    list[bpy.types.Object],
    list[DigitSpec],
    list[BoneSpec],
    list[NailSpec],
    list[tuple[Vector, Vector, Vector, float, float]],
]:
    """Build the sculpted cradle hand matching the reference photo's exact posture."""
    palm_parts: list[bpy.types.Object] = []
    digits: list[DigitSpec] = []
    bones: list[BoneSpec] = []
    nails: list[NailSpec] = []
    palmar_lines: list[tuple[Vector, Vector, Vector, float, float]] = []

    # 1. Forearm & Wrist
    forearm_base = Vector((-3.0, 10.0, -340.0))
    wrist_center = Vector((-4.0, 4.0, -94.0))
    palm_center = Vector((-9.0, 1.5, -56.0))

    palm_parts.append(
        create_anatomical_phalanx(
            "Forearm_Shaft",
            forearm_base,
            wrist_center,
            39.0,
            25.5,
            Vector((-0.22, -0.97, 0.0)),
            volar_belly=0.04,
            dorsal_flat=0.64,
            volar_flat=0.66,
            rings=32,
            segments=40,
        )
    )
    palm_parts.append(
        create_anatomical_phalanx(
            "Wrist_Carpal",
            wrist_center,
            palm_center,
            25.5,
            28.0,
            Vector((-0.26, -0.96, 0.0)),
            volar_belly=0.03,
            dorsal_flat=0.56,
            volar_flat=0.58,
            rings=14,
            segments=38,
        )
    )

    bones.append(
        BoneSpec("forearm", None, forearm_base, wrist_center, Vector((0.0, -1.0, 0.0)), 39.0, 25.5, "arm")
    )
    bones.append(
        BoneSpec("wrist", "forearm", wrist_center, palm_center, Vector((0.0, -1.0, 0.0)), 25.5, 28.0, "palm")
    )
    bones.append(
        BoneSpec(
            "palm",
            "wrist",
            palm_center,
            Vector((-13.0, -1.0, -20.0)),
            Vector((-0.32, -0.94, 0.0)),
            31.0,
            33.0,
            "palm",
        )
    )

    # 2. Palm body, Dorsal Web & Thenar/Hypothenar cushions
    palm_parts.append(
        add_ellipsoid(
            "Palm_Core",
            (-10.0, 2.5, -48.0),
            (25.5, 14.5, 36.0),
            (math.radians(5.0), math.radians(-10.0), math.radians(8.0)),
        )
    )
    palm_parts.append(
        add_ellipsoid(
            "Dorsal_Web_Pad",
            (-24.5, 0.0, -23.0),
            (16.5, 12.2, 23.5),
            (math.radians(8.0), math.radians(-18.0), math.radians(14.0)),
        )
    )
    palm_parts.append(
        add_ellipsoid(
            "Hypothenar_Pad",
            (10.5, 2.5, -63.0),
            (17.5, 13.5, 31.0),
            (math.radians(4.0), math.radians(12.0), math.radians(-10.0)),
        )
    )

    # 3. Four Fingers in the Reference Photo's Stepped Diagonal Cascade
    finger_defs = [
        (
            "index",
            Vector((-15.0, 2.0, -48.0)),
            Vector((-13.0, -5.5, -10.5)),
            Vector((11.5, -11.5, -8.0)),
            Vector((29.5, -13.2, -13.0)),
            Vector((43.5, -11.8, -19.0)),
            [9.8, 9.6, 8.7, 7.7, 6.7],
            [
                Vector((-0.62, -0.74, 0.25)).normalized(),
                Vector((-0.18, -0.74, 0.65)).normalized(),
                Vector((0.12, -0.82, 0.56)).normalized(),
                Vector((0.26, -0.90, 0.35)).normalized(),
            ],
            [0.82, 0.80, 0.58],
            0.92,
        ),
        (
            "middle",
            Vector((-13.0, 3.0, -56.0)),
            Vector((-19.5, -3.5, -33.0)),
            Vector((1.5, -15.2, -20.5)),
            Vector((21.5, -17.5, -32.0)),
            Vector((18.5, -8.5, -48.5)),
            [10.0, 9.9, 9.0, 8.0, 7.0],
            [
                Vector((-0.65, -0.72, 0.24)).normalized(),
                Vector((-0.42, -0.76, 0.49)).normalized(),
                Vector((0.35, -0.82, 0.45)).normalized(),
                Vector((0.76, -0.52, -0.38)).normalized(),
            ],
            [0.85, 0.96, 0.88],
            0.86,
        ),
        (
            "ring",
            Vector((-10.0, 4.0, -64.0)),
            Vector((-23.5, -1.8, -53.0)),
            Vector((-2.5, -15.8, -37.5)),
            Vector((17.5, -18.0, -49.5)),
            Vector((14.0, -8.5, -65.5)),
            [9.4, 9.3, 8.4, 7.5, 6.5],
            [
                Vector((-0.66, -0.72, 0.22)).normalized(),
                Vector((-0.45, -0.76, 0.46)).normalized(),
                Vector((0.35, -0.82, 0.45)).normalized(),
                Vector((0.76, -0.52, -0.38)).normalized(),
            ],
            [0.85, 0.96, 0.88],
            0.86,
        ),
        (
            "pinky",
            Vector((-6.5, 5.0, -73.0)),
            Vector((-25.5, 0.0, -71.0)),
            Vector((-6.0, -14.2, -55.5)),
            Vector((12.5, -16.5, -66.5)),
            Vector((9.5, -7.5, -80.5)),
            [8.4, 8.2, 7.4, 6.6, 5.7],
            [
                Vector((-0.68, -0.70, 0.22)).normalized(),
                Vector((-0.46, -0.76, 0.45)).normalized(),
                Vector((0.35, -0.82, 0.45)).normalized(),
                Vector((0.76, -0.52, -0.38)).normalized(),
            ],
            [0.82, 0.94, 0.85],
            0.84,
        ),
    ]

    for fname, mc_base, knk, pip, dip, tip, radii, dorsals, flexions, nw in finger_defs:
        digits.append(
            DigitSpec(
                name=fname,
                points=[mc_base, knk, pip, dip, tip],
                radii=radii,
                dorsals=dorsals,
                flexions=flexions,
                nail_width_scale=nw,
            )
        )
        bones.append(BoneSpec(f"metacarpal_{fname}", "palm", mc_base, knk, dorsals[0], radii[0], radii[1], fname))
        bones.append(BoneSpec(f"{fname}_01", f"metacarpal_{fname}", knk, pip, dorsals[1], radii[1], radii[2], fname))
        bones.append(BoneSpec(f"{fname}_02", f"{fname}_01", pip, dip, dorsals[2], radii[2], radii[3], fname))
        bones.append(BoneSpec(f"{fname}_03", f"{fname}_02", dip, tip, dorsals[3], radii[3], radii[4], fname))
        nails.append(NailSpec(fname, f"{fname}_03", dip, tip, dorsals[3], radii[4], width_scale=nw))

    # 4. Upward-Reaching Thumb on the Left (cradling the book spine at X ~ -44 mm)
    th_cmc = Vector((-29.0, 2.5, -48.0))
    th_mcp = Vector((-45.5, -2.0, -15.0))
    th_ip = Vector((-47.5, -4.5, 14.0))
    th_tip = Vector((-42.5, -3.5, 41.5))
    th_radii = [14.0, 11.6, 9.8, 7.7]
    th_dorsals = [
        Vector((-0.88, -0.44, -0.16)).normalized(),
        Vector((-0.92, -0.38, 0.05)).normalized(),
        Vector((-0.86, -0.46, 0.22)).normalized(),
    ]
    digits.append(
        DigitSpec(
            name="thumb",
            points=[th_cmc, th_mcp, th_ip, th_tip],
            radii=th_radii,
            dorsals=th_dorsals,
            flexions=[0.75, 0.72],
            nail_width_scale=0.88,
        )
    )
    bones.append(BoneSpec("thumb_01", "wrist", th_cmc, th_mcp, th_dorsals[0], th_radii[0], th_radii[1], "thumb"))
    bones.append(BoneSpec("thumb_02", "thumb_01", th_mcp, th_ip, th_dorsals[1], th_radii[1], th_radii[2], "thumb"))
    bones.append(BoneSpec("thumb_03", "thumb_02", th_ip, th_tip, th_dorsals[2], th_radii[2], th_radii[3], "thumb"))
    nails.append(NailSpec("thumb", "thumb_03", th_ip, th_tip, th_dorsals[2], th_radii[3], width_scale=0.88))

    view_n = Vector((0.0, -1.0, 0.0))
    palmar_lines.extend(
        [
            (Vector((-26.0, -8.0, -16.0)), Vector((-4.0, -10.0, -32.0)), view_n, 1.3, 0.62),
            (Vector((18.0, -9.0, -48.0)), Vector((2.0, -11.0, -78.0)), view_n, 1.4, 0.58),
            (Vector((-22.0, -10.0, -88.0)), Vector((15.0, -10.0, -90.0)), view_n, 1.2, 0.48),
            (Vector((-20.0, -9.5, -94.0)), Vector((13.0, -9.5, -96.0)), view_n, 1.0, 0.38),
        ]
    )

    return palm_parts, digits, bones, nails, palmar_lines


def build_phone_hand_scene() -> tuple[
    list[bpy.types.Object],
    list[DigitSpec],
    list[BoneSpec],
    list[NailSpec],
    list[tuple[Vector, Vector, Vector, float, float]],
]:
    """Build the anatomical right hand gripping the 92 x 188 x 11 mm phone."""
    palm_parts: list[bpy.types.Object] = []
    digits: list[DigitSpec] = []
    bones: list[BoneSpec] = []
    nails: list[NailSpec] = []
    palmar_lines: list[tuple[Vector, Vector, Vector, float, float]] = []

    forearm_base = Vector((4.0, 8.0, -640.0))
    wrist_center = Vector((1.0, 2.5, -54.0))
    palm_center = Vector((0.0, 1.5, -6.0))

    palm_parts.append(
        create_anatomical_phalanx(
            "Forearm_Shaft",
            forearm_base,
            wrist_center,
            44.0,
            27.5,
            Vector((0.0, 1.0, 0.0)),
            volar_belly=0.04,
            dorsal_flat=0.64,
            volar_flat=0.52,
            rings=36,
            segments=40,
        )
    )
    palm_parts.append(
        create_anatomical_phalanx(
            "Wrist_Carpal",
            wrist_center,
            palm_center,
            27.5,
            31.0,
            Vector((0.0, 1.0, 0.0)),
            volar_belly=0.03,
            dorsal_flat=0.52,
            volar_flat=0.44,
            rings=14,
            segments=38,
        )
    )

    bones.append(
        BoneSpec("forearm", None, forearm_base, wrist_center, Vector((0.0, 1.0, 0.0)), 44.0, 27.5, "arm")
    )
    bones.append(
        BoneSpec("wrist", "forearm", wrist_center, palm_center, Vector((0.0, 1.0, 0.0)), 28.0, 32.0, "palm")
    )
    bones.append(
        BoneSpec(
            "palm",
            "wrist",
            palm_center,
            Vector((0.0, 0.0, 28.0)),
            Vector((0.0, 1.0, 0.0)),
            35.0,
            37.0,
            "palm",
        )
    )

    palm_parts.append(
        add_ellipsoid(
            "Palm_Core",
            (0.0, 1.5, 0.0),
            (40.0, 14.2, 42.0),
            (math.radians(-4.0), 0.0, 0.0),
        )
    )
    palm_parts.append(
        add_ellipsoid(
            "Thenar_Pad",
            (-26.5, -2.5, -17.0),
            (20.0, 14.0, 25.5),
            (math.radians(14.0), math.radians(-20.0), math.radians(14.0)),
        )
    )
    palm_parts.append(
        add_ellipsoid(
            "Dorsal_Web_Pad",
            (-33.0, -1.5, 6.0),
            (14.5, 11.8, 22.0),
        )
    )
    palm_parts.append(
        add_ellipsoid(
            "Hypothenar_Pad",
            (28.0, 0.5, -9.0),
            (15.5, 12.8, 31.5),
        )
    )

    finger_defs = [
        (
            "index",
            Vector((-35.0, -1.5, 42.0)),
            Vector((-35.5, -6.0, 65.0)),
            Vector((-34.5, -9.8, 81.0)),
            Vector((-33.0, -12.2, 93.0)),
            [9.4, 9.2, 8.3, 7.4, 6.5],
        ),
        (
            "middle",
            Vector((-12.0, -1.0, 44.0)),
            Vector((-11.8, -5.8, 69.0)),
            Vector((-11.2, -9.6, 86.0)),
            Vector((-10.5, -12.2, 99.0)),
            [9.8, 9.6, 8.6, 7.7, 6.8],
        ),
        (
            "ring",
            Vector((11.5, -1.5, 42.0)),
            Vector((12.0, -6.0, 66.0)),
            Vector((11.8, -9.8, 82.0)),
            Vector((11.2, -12.2, 94.0)),
            [9.2, 9.0, 8.1, 7.2, 6.4],
        ),
        (
            "pinky",
            Vector((33.5, -2.0, 36.5)),
            Vector((34.2, -6.2, 56.5)),
            Vector((33.8, -9.6, 70.0)),
            Vector((32.8, -12.0, 81.0)),
            [8.1, 7.9, 7.1, 6.3, 5.6],
        ),
    ]

    for fname, knk, pip, dip, tip, radii in finger_defs:
        mc_base = Vector((knk.x * 0.72, 2.5, -16.0))
        dorsals = [
            Vector((0.0, 0.98, 0.16)).normalized(),
            Vector((0.0, 0.96, 0.24)).normalized(),
            Vector((0.0, 0.95, 0.28)).normalized(),
            Vector((0.0, 0.94, 0.32)).normalized(),
        ]
        digits.append(
            DigitSpec(
                name=fname,
                points=[mc_base, knk, pip, dip, tip],
                radii=radii,
                dorsals=dorsals,
                flexions=[0.55, 0.65, 0.58],
                nail_width_scale=0.88,
            )
        )
        bones.append(BoneSpec(f"metacarpal_{fname}", "palm", mc_base, knk, dorsals[0], radii[0], radii[1], fname))
        bones.append(BoneSpec(f"{fname}_01", f"metacarpal_{fname}", knk, pip, dorsals[1], radii[1], radii[2], fname))
        bones.append(BoneSpec(f"{fname}_02", f"{fname}_01", pip, dip, dorsals[2], radii[2], radii[3], fname))
        bones.append(BoneSpec(f"{fname}_03", f"{fname}_02", dip, tip, dorsals[3], radii[3], radii[4], fname))
        nails.append(NailSpec(fname, f"{fname}_03", dip, tip, dorsals[3], radii[4], width_scale=0.88))

    th_cmc = Vector((-38.5, 0.0, -14.0))
    th_mcp = Vector((-55.5, -16.5, 6.0))
    th_ip = Vector((-51.5, -24.0, 31.5))
    th_tip = Vector((-40.5, -29.8, 44.5))
    th_radii = [14.8, 12.4, 10.5, 8.3]
    th_dorsals = [
        Vector((-0.82, -0.35, 0.45)).normalized(),
        Vector((-0.78, -0.58, 0.24)).normalized(),
        Vector((-0.55, -0.78, 0.28)).normalized(),
    ]
    digits.append(
        DigitSpec(
            name="thumb",
            points=[th_cmc, th_mcp, th_ip, th_tip],
            radii=th_radii,
            dorsals=th_dorsals,
            flexions=[0.72, 0.82],
            nail_width_scale=0.92,
        )
    )
    bones.append(BoneSpec("thumb_01", "wrist", th_cmc, th_mcp, th_dorsals[0], th_radii[0], th_radii[1], "thumb"))
    bones.append(BoneSpec("thumb_02", "thumb_01", th_mcp, th_ip, th_dorsals[1], th_radii[1], th_radii[2], "thumb"))
    bones.append(BoneSpec("thumb_03", "thumb_02", th_ip, th_tip, th_dorsals[2], th_radii[2], th_radii[3], "thumb"))
    nails.append(NailSpec("thumb", "thumb_03", th_ip, th_tip, th_dorsals[2], th_radii[3], width_scale=0.92))

    palmar_n = Vector((0.0, -1.0, 0.0))
    palmar_lines.extend(
        [
            (Vector((-12.0, -13.0, 22.0)), Vector((30.0, -13.0, 16.0)), palmar_n, 1.3, 0.60),
            (Vector((-30.0, -13.0, 12.0)), Vector((16.0, -13.0, 2.0)), palmar_n, 1.3, 0.55),
            (Vector((-30.0, -13.0, 10.0)), Vector((-8.0, -13.0, -24.0)), palmar_n, 1.5, 0.62),
            (Vector((-22.0, -13.0, -44.0)), Vector((24.0, -13.0, -44.0)), palmar_n, 1.2, 0.48),
        ]
    )

    return palm_parts, digits, bones, nails, palmar_lines


def sculpt_palm_details(
    palm_obj: bpy.types.Object,
    bones: list[BoneSpec],
    palmar_lines: list[tuple[Vector, Vector, Vector, float, float]],
) -> None:
    """Sculpt extensor tendons and palmar/wrist flexion lines onto the fused palm mesh."""
    mesh = palm_obj.data
    normals = [v.normal.copy() for v in mesh.vertices]
    coords = [v.co.copy() for v in mesh.vertices]
    deltas = [Vector((0.0, 0.0, 0.0)) for _ in mesh.vertices]

    mc_bones = [b for b in bones if b.name.startswith("metacarpal_")]
    for b in mc_bones:
        seg = b.tail - b.head
        seg_len = seg.length
        t_vec, d_vec, l_vec = orthonormal_frame(seg, b.dorsal)
        for idx, co in enumerate(coords):
            rel = co - b.head
            axial = rel.dot(t_vec)
            if axial < -4.0 or axial > seg_len + 4.0:
                continue
            s = max(0.0, min(1.0, axial / seg_len))
            if rel.dot(d_vec) < 2.0 or normals[idx].dot(d_vec) < 0.25:
                continue
            lat = rel.dot(l_vec)
            if abs(lat) > 7.5:
                continue
            env = math.sin(math.pi * s) ** 0.8
            ridge = math.exp(-((lat / 2.5) ** 2)) - 0.35 * math.exp(-(((abs(lat) - 5.0) / 2.2) ** 2))
            deltas[idx] += d_vec * (0.55 * env * ridge)

    for p_start, p_end, p_norm, p_width, p_depth in palmar_lines:
        seg = p_end - p_start
        seg_len = seg.length
        seg_dir = seg.normalized()
        for idx, co in enumerate(coords):
            if normals[idx].dot(p_norm) < 0.18:
                continue
            rel = co - p_start
            t = rel.dot(seg_dir)
            if t < -p_width * 2.0 or t > seg_len + p_width * 2.0:
                continue
            s = max(0.0, min(1.0, t / seg_len))
            closest = p_start + seg_dir * (s * seg_len)
            dist_vec = co - closest
            if dist_vec.length > p_width * 3.2:
                continue
            perp_dist = (dist_vec - p_norm * dist_vec.dot(p_norm)).length
            if perp_dist > p_width * 2.6:
                continue
            taper = math.sin(math.pi * s) ** 0.65
            groove = -p_depth * taper * math.exp(-((perp_dist / p_width) ** 2) * 2.0)
            deltas[idx] += normals[idx] * groove

    for idx, v in enumerate(mesh.vertices):
        v.co = coords[idx] + deltas[idx]
    mesh.update()
    ensure_outward_normals(palm_obj)


def build_fingernails(nails: list[NailSpec]) -> list[bpy.types.Object]:
    """Create curved fingernail plates (`Hand_Nail` material) with clean UVs and outward normals."""
    nail_objs: list[bpy.types.Object] = []
    nu, nv = 12, 14

    for ns in nails:
        seg = ns.tip - ns.knuckle
        seg_len = seg.length
        t_vec, d_vec, l_vec = orthonormal_frame(seg, ns.dorsal)

        nail_w = ns.radius_tip * 0.68 * ns.width_scale
        s_start = 0.34
        s_end = 0.93

        verts: list[tuple[float, float, float]] = []
        faces: list[tuple[int, int, int, int]] = []
        uvs: list[tuple[float, float]] = []

        for iv in range(nv + 1):
            v = iv / nv
            for iu in range(nu + 1):
                u_norm = (iu / nu) * 2.0 - 1.0
                u_abs = abs(u_norm)

                prox_inset = 0.11 * (u_abs**2.2)
                dist_inset = 0.09 * (u_abs**2.5)
                s = (s_start + prox_inset * (1.0 - v)) + v * (s_end - s_start - dist_inset * v)

                width_env = 0.88 + 0.14 * math.sin(math.pi * v) - 0.05 * (v**3)
                lat = u_norm * nail_w * width_env

                r_local = ns.radius_tip * (1.10 - 0.13 * s)
                dorsal_base = r_local * (0.74 - 0.05 * s)
                arch_drop = nail_w * 0.36 * (u_abs**1.85)
                long_arch = 0.36 * math.sin(math.pi * v)
                root_tuck = -0.36 * math.exp(-((v / 0.15) ** 2))
                edge_tuck = -0.22 * math.exp(-(((1.0 - u_abs) / 0.12) ** 2))
                tip_bevel = -0.10 * math.exp(-(((1.0 - v) / 0.06) ** 2))

                dorsal_h = dorsal_base - arch_drop + long_arch + root_tuck + edge_tuck + tip_bevel + 0.24

                pos = ns.knuckle + t_vec * (s * seg_len) + l_vec * lat + d_vec * dorsal_h
                verts.append((pos.x, pos.y, pos.z))

        for iv in range(nv):
            for iu in range(nu):
                a = iv * (nu + 1) + iu
                b = a + 1
                c = a + (nu + 1) + 1
                d = a + (nu + 1)
                faces.append((a, d, c, b))
                for uu, vv in (
                    (iu / nu, iv / nv),
                    (iu / nu, (iv + 1) / nv),
                    ((iu + 1) / nu, (iv + 1) / nv),
                    ((iu + 1) / nu, iv / nv),
                ):
                    uvs.append((uu, vv))

        mesh = bpy.data.meshes.new(f"Nail_{ns.chain}")
        mesh.from_pydata(verts, [], faces)
        mesh.validate()
        mesh.update()
        uv_layer = mesh.uv_layers.new(name="UVMap")
        for loop_idx, uv in enumerate(uvs):
            uv_layer.data[loop_idx].uv = uv

        obj = bpy.data.objects.new(f"Nail_{ns.chain}", mesh)
        bpy.context.collection.objects.link(obj)
        ensure_outward_normals(obj)
        nail_objs.append(obj)

    return nail_objs


def fuse_and_detail(
    palm_parts: list[bpy.types.Object],
    digits: list[DigitSpec],
    bones: list[BoneSpec],
    nails: list[NailSpec],
    palmar_lines: list[tuple[Vector, Vector, Vector, float, float]],
    origin_offset: tuple[float, float, float],
) -> tuple[bpy.types.Object, bpy.types.Object]:
    """Fuse the palm/wrist/forearm base, attach the 5 articulated quad digits & 5 nails,
    and bind the 22-bone armature with zero cross-finger bleed."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in palm_parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = palm_parts[0]
    bpy.ops.object.join()

    palm = bpy.context.active_object
    palm.name = "HandBlockout"
    palm.data.name = "HandBlockout"

    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    ensure_outward_normals(palm)
    bpy.context.view_layer.objects.active = palm

    remesh = palm.modifiers.new("Remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = 1.05
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier="Remesh")

    smooth = palm.modifiers.new("Smooth", "SMOOTH")
    smooth.factor = 0.48
    smooth.iterations = 10
    bpy.ops.object.modifier_apply(modifier="Smooth")

    vg_decimate = palm.vertex_groups.new(name="DecimateWeight")
    for idx, v in enumerate(palm.data.vertices):
        w = 0.35 if v.co.z > -95.0 else 1.0
        vg_decimate.add([idx], w, "REPLACE")

    current_tris = sum(len(p.vertices) - 2 for p in palm.data.polygons)
    if current_tris > TARGET_PALM_TRIS:
        decimate = palm.modifiers.new("Decimate", "DECIMATE")
        decimate.ratio = TARGET_PALM_TRIS / current_tris
        decimate.vertex_group = "DecimateWeight"
        bpy.ops.object.modifier_apply(modifier="Decimate")

    vg_ref = palm.vertex_groups.get("DecimateWeight")
    if vg_ref is not None:
        palm.vertex_groups.remove(vg_ref)

    relax = palm.modifiers.new("Relax", "SMOOTH")
    relax.factor = 0.30
    relax.iterations = 2
    bpy.ops.object.modifier_apply(modifier="Relax")

    sculpt_palm_details(palm, bones, palmar_lines)

    if not palm.data.uv_layers:
        uv_layer = palm.data.uv_layers.new(name="UVMap")
        for poly in palm.data.polygons:
            for loop_idx in poly.loop_indices:
                v = palm.data.vertices[palm.data.loops[loop_idx].vertex_index].co
                uv_layer.data[loop_idx].uv = ((v.x + 80.0) / 160.0, (v.z + 100.0) / 220.0)

    skin_mat = make_skin_material()
    nail_mat = make_nail_material()
    palm.data.materials.append(skin_mat)

    # Build the 5 continuous articulated quad digits (never decimated!)
    digit_objs = [create_articulated_digit(d_spec, segments=22) for d_spec in digits]
    for d_obj in digit_objs:
        d_obj.data.materials.append(skin_mat)

    nail_objs = build_fingernails(nails)
    for n_obj in nail_objs:
        n_obj.data.materials.append(nail_mat)

    bpy.ops.object.select_all(action="DESELECT")
    palm.select_set(True)
    for d_obj in digit_objs:
        d_obj.select_set(True)
    for n_obj in nail_objs:
        n_obj.select_set(True)
    bpy.context.view_layer.objects.active = palm
    bpy.ops.object.join()

    hand = palm
    offset_vec = Vector(origin_offset)
    for v in hand.data.vertices:
        v.co += offset_vec
    hand.data.validate()
    hand.data.update()

    for b in bones:
        b.head = b.head + offset_vec
        b.tail = b.tail + offset_vec

    bpy.ops.object.shade_smooth()

    armature = build_armature_and_bind(hand, bones)
    return hand, armature


def build_armature_and_bind(hand: bpy.types.Object, bones: list[BoneSpec]) -> bpy.types.Object:
    """Create the 22-bone HandArmature and assign smooth, branch-isolated vertex weights."""
    arm_data = bpy.data.armatures.new("HandArmature")
    arm_obj = bpy.data.objects.new("HandArmature", arm_data)
    bpy.context.collection.objects.link(arm_obj)

    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")

    edit_bones: dict[str, bpy.types.EditBone] = {}
    for b in bones:
        eb = arm_data.edit_bones.new(b.name)
        eb.head = b.head
        eb.tail = b.tail
        eb.align_roll(b.dorsal)
        if b.parent and b.parent in edit_bones:
            eb.parent = edit_bones[b.parent]
            if (eb.head - eb.parent.tail).length < 1.5:
                eb.use_connect = True
        edit_bones[b.name] = eb

    bpy.ops.object.mode_set(mode="OBJECT")

    vgroups = {b.name: hand.vertex_groups.new(name=b.name) for b in bones}

    nail_verts: set[int] = set()
    for poly in hand.data.polygons:
        if poly.material_index == 1:
            for vi in poly.vertices:
                nail_verts.add(vi)

    distal_bones = [b for b in bones if b.name.endswith("_03")]
    finger_chains = ("thumb", "index", "middle", "ring", "pinky")
    chain_bones = {
        c: [b for b in bones if b.chain == c and not b.name.startswith("metacarpal_")]
        for c in finger_chains
    }

    for idx, v in enumerate(hand.data.vertices):
        co = v.co
        if idx in nail_verts:
            best_b = min(distal_bones, key=lambda b: segment_distance(co, b.head, b.tail)[0])
            vgroups[best_b.name].add([idx], 1.0, "REPLACE")
            continue

        best_chain = None
        best_chain_ratio = 999.0
        for c in finger_chains:
            for b in chain_bones[c]:
                dist, t = segment_distance(co, b.head, b.tail)
                r = b.ra + (b.rb - b.ra) * t
                ratio = dist / max(1.0, r)
                if ratio < best_chain_ratio:
                    best_chain_ratio = ratio
                    best_chain = c

        weights: list[tuple[str, float]] = []
        for b in bones:
            if best_chain_ratio < 1.28 and b.chain in finger_chains and b.chain != best_chain:
                continue
            dist, t = segment_distance(co, b.head, b.tail)
            r = (b.ra + (b.rb - b.ra) * t) * 1.15
            sigma = max(4.5, r * 0.72)
            norm_d = max(0.0, dist - r * 0.35) / sigma
            if norm_d > 3.2:
                continue
            w = math.exp(-(norm_d * norm_d) * 1.35)
            if w > 1e-3:
                weights.append((b.name, w))

        if not weights:
            nearest = min(bones, key=lambda b: segment_distance(co, b.head, b.tail)[0])
            weights = [(nearest.name, 1.0)]

        weights.sort(key=lambda item: item[1], reverse=True)
        top = weights[:4]
        total = sum(w for _, w in top)
        for bname, w in top:
            vgroups[bname].add([idx], w / total, "REPLACE")

    hand.parent = arm_obj
    arm_mod = hand.modifiers.new("Armature", "ARMATURE")
    arm_mod.object = arm_obj
    return arm_obj


def make_skin_material() -> bpy.types.Material:
    material = bpy.data.materials.new("Hand_Skin")
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = (0.026, 0.014, 0.010, 1.0)
    principled.inputs["Roughness"].default_value = 0.62
    principled.inputs["Specular IOR Level"].default_value = 0.38
    if "Subsurface Weight" in principled.inputs:
        principled.inputs["Subsurface Weight"].default_value = 0.25
    if "Sheen Weight" in principled.inputs:
        principled.inputs["Sheen Weight"].default_value = 0.14
        principled.inputs["Sheen Roughness"].default_value = 0.65
        principled.inputs["Sheen Tint"].default_value = (0.85, 0.40, 0.24, 1.0)
    return material


def make_nail_material() -> bpy.types.Material:
    material = bpy.data.materials.new("Hand_Nail")
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = (0.17, 0.068, 0.032, 1.0)
    principled.inputs["Roughness"].default_value = 0.24
    principled.inputs["Specular IOR Level"].default_value = 0.60
    if "Coat Weight" in principled.inputs:
        principled.inputs["Coat Weight"].default_value = 0.68
        principled.inputs["Coat Roughness"].default_value = 0.16
    return material


def preview_rig() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 800
    scene.render.resolution_y = 1000
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("PreviewWorld")
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.015, 0.011, 0.009, 1.0)
        bg.inputs[1].default_value = 0.55

    camera = bpy.data.objects.new("PreviewCamera", bpy.data.cameras.new("PreviewCamera"))
    bpy.context.collection.objects.link(camera)
    camera.data.lens = 75
    scene.camera = camera

    key = bpy.data.objects.new("PreviewKey", bpy.data.lights.new("PreviewKey", "AREA"))
    bpy.context.collection.objects.link(key)
    key.location = (-280.0, -200.0, 140.0)
    key.data.energy = 3100000
    key.data.color = (1.0, 0.68, 0.42)
    key.data.size = 95
    key.rotation_euler = (math.radians(78), 0.0, math.radians(-52))

    rim = bpy.data.objects.new("PreviewRim", bpy.data.lights.new("PreviewRim", "AREA"))
    bpy.context.collection.objects.link(rim)
    rim.location = (250.0, 120.0, 140.0)
    rim.data.energy = 2600000
    rim.data.color = (1.0, 0.48, 0.44)
    rim.data.size = 80
    rim.rotation_euler = (math.radians(62), 0.0, math.radians(125))

    fill = bpy.data.objects.new("PreviewFill", bpy.data.lights.new("PreviewFill", "AREA"))
    bpy.context.collection.objects.link(fill)
    fill.location = (30.0, -320.0, 160.0)
    fill.data.energy = 750000
    fill.data.color = (1.0, 0.80, 0.62)
    fill.data.size = 150
    fill.rotation_euler = (math.radians(64), 0.0, math.radians(6))


def render_preview(name: str, location: tuple[float, float, float], target: Vector) -> None:
    camera = bpy.data.objects["PreviewCamera"]
    camera.location = location
    camera.rotation_euler = (target - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = str(PREVIEW / f"{name}.png")
    bpy.ops.render.render(write_still=True)


def build_asset(
    builder,
    origin_offset: tuple[float, float, float],
    blend_name: str,
    glb_names: list[str],
    label: str,
    previews: list[tuple[str, tuple[float, float, float], Vector]],
) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    palm_parts, digits, bones, nails, palmar_lines = builder()
    hand, armature = fuse_and_detail(palm_parts, digits, bones, nails, palmar_lines, origin_offset)

    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / blend_name))
    if "hand.glb" in glb_names:
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "hand.blend"))

    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    hand.select_set(True)
    bpy.context.view_layer.objects.active = armature

    for glb_name in glb_names:
        bpy.ops.export_scene.gltf(
            filepath=str(MODELS / glb_name),
            export_format="GLB",
            use_selection=True,
            export_apply=False,
            export_skins=True,
            export_all_influences=False,
            export_normals=True,
            export_materials="EXPORT",
            export_cameras=False,
            export_lights=False,
            export_extras=True,
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=6,
            export_yup=True,
        )

    tris = sum(len(p.vertices) - 2 for p in hand.data.polygons)
    print(f"{label}_TRIS={tris} BONES={len(armature.data.bones)}")

    preview_rig()
    for name, location, target in previews:
        render_preview(name, location, target)


def main() -> None:
    build_asset(
        build_book_hand_scene,
        (0.0, 0.0, 0.0),
        "hand-blockout.blend",
        ["hand-blockout.glb", "hand.glb"],
        "HAND_BOOK",
        [
            ("front", (-15.0, -340.0, -15.0), Vector((-5.0, -5.0, -32.0))),
            ("side", (340.0, -140.0, -20.0), Vector((0.0, 0.0, -32.0))),
            ("top", (-10.0, -160.0, 320.0), Vector((-5.0, 0.0, -25.0))),
        ],
    )
    build_asset(
        build_phone_hand_scene,
        (0.0, 21.0, 0.0),
        "hand-phone.blend",
        ["hand-phone.glb"],
        "HAND_PHONE",
        [
            ("phone-front", (-60.0, -400.0, 50.0), Vector((-6.0, 10.0, 10.0))),
            ("phone-side", (-380.0, -160.0, 50.0), Vector((-15.0, 10.0, 12.0))),
        ],
    )


if __name__ == "__main__":
    main()
