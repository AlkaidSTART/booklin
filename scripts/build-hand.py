#!/usr/bin/env python3
"""Build the rigged right hand for Bookln from the sculpt in public/hand.

Run:
  blender -b --python scripts/build-hand.py

Source: public/hand/hand.OBJ (ZBrush, centimetres, closed 1,102-vert sculpt).
Units: the source is centimetres; the runtime mounts the GLB inside the book's
0.001 millimetre group, so every coordinate is multiplied by 10 on export.

The mesh arrives in an arbitrary ZBrush orientation, so the first thing this
script does is express it in a hand-local frame measured from the scan itself:

  +Y = wrist -> fingers        (hand forward)
  +X = index -> pinky          (across the knuckles, thumb sits at -X)
  +Z = back of the hand        (-Z is the palm)

That frame is then rotated into Blender's Z-up space with the glTF Y-up
convention baked in, so the exported node locally matches three.js:

  +Y = fingers, -Z = palm, +X = across the knuckles

Origin: the grip point for a 30 mm book edge — the palm crease, half the book
thickness to the palm side. The runtime can therefore attach the hand straight
to the book edge socket without magic offsets.

Rig: 22 bones — forearm, wrist, palm, five metacarpals, four 3-joint finger
chains and a 3-joint thumb. Every bone's roll is aligned to the back-of-hand
axis, which makes local X the curl axis for every digit: a negative rotation
around local X flexes the digit toward the palm.

The source scan is an open, relaxed hand, so the grip poses (book edge, phone)
are produced at runtime by rotating these bones; the GLB stores the neutral
pose only.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE_OBJ = ROOT / "public" / "hand" / "hand.OBJ"
MODELS = ROOT / "public" / "models"
SOURCE = MODELS / "source"
PREVIEW = Path("/tmp/bookln-hand")
SOURCE.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)

CM_TO_MM = 10.0

# ---------------------------------------------------------------------------
# Landmarks measured on the source sculpt (centimetres, raw OBJ space)
# ---------------------------------------------------------------------------

# The far end of the wrist stump: the geodesic diameter endpoint of the scan.
WRIST_RAW = Vector((-21.40, -36.31, 0.0))

TIPS_RAW = {
    "index": Vector((-34.10, -48.51, 3.86)),
    "middle": Vector((-35.16, -49.26, 0.95)),
    "ring": Vector((-33.96, -48.93, -1.65)),
    "pinky": Vector((-32.06, -47.75, -4.26)),
    "thumb": Vector((-27.02, -46.53, 7.00)),
}

MCPS_RAW = {
    "index": Vector((-30.23, -44.05, 2.82)),
    "middle": Vector((-31.28, -45.17, 1.31)),
    "ring": Vector((-30.27, -44.40, 0.68)),
    "pinky": Vector((-29.41, -43.70, -1.09)),
}

# Grip point in the hand-local frame: palm crease, half a 30 mm book inward.
GRIP_ORIGIN = Vector((1.15, 12.40, -2.30))


def build_frame() -> tuple[Vector, Vector, Vector]:
    knuckles = sum(MCPS_RAW.values(), Vector()) / len(MCPS_RAW)
    y_axis = (knuckles - WRIST_RAW).normalized()
    x_raw = (TIPS_RAW["pinky"] - TIPS_RAW["index"]).normalized()
    x_axis = (x_raw - y_axis * x_raw.dot(y_axis)).normalized()
    z_axis = x_axis.cross(y_axis).normalized()
    return x_axis, y_axis, z_axis


AXIS_X, AXIS_Y, AXIS_Z = build_frame()


def to_canonical(point: Vector) -> Vector:
    delta = point - WRIST_RAW
    return Vector((delta.dot(AXIS_X), delta.dot(AXIS_Y), delta.dot(AXIS_Z)))


def canonical_to_blender(point: Vector) -> Vector:
    """Canonical (X across, Y fingers, Z back) -> Blender Z-up for glTF Y-up.

    glTF maps Blender (x, y, z) to (x, z, -y); inverting that gives
    (blender x, blender y, blender z) = (canon x, -canon z, canon y).
    """
    local = (point - GRIP_ORIGIN) * CM_TO_MM
    return Vector((local.x, -local.z, local.y))


def to_mm(point: Vector) -> Vector:
    return (point - GRIP_ORIGIN) * CM_TO_MM


def direction_to_blender(direction: Vector) -> Vector:
    """Rotate a canonical direction into the Blender export frame."""
    return Vector(
        (
            direction.dot(AXIS_X),
            -direction.dot(AXIS_Z),
            direction.dot(AXIS_Y),
        )
    )


# Back-of-hand direction in the exported frame: palm side is +Y in Blender.
DORSAL = direction_to_blender(AXIS_Z)


# ---------------------------------------------------------------------------
# Bone layout in the canonical hand frame (centimetres)
# ---------------------------------------------------------------------------

WRIST_JOINT = Vector((0.10, 2.50, 0.20))
PALM_BASE = Vector((0.30, 4.50, 0.00))
KNUCKLE_CENTER = Vector((1.15, 12.40, -0.60))

MCP_CANON = {
    "index": Vector((-2.00, 13.40, -0.60)),
    "middle": Vector((-0.40, 13.60, -0.60)),
    "ring": Vector((1.90, 13.00, -0.60)),
    "pinky": Vector((4.20, 12.40, -0.60)),
}

THUMB_CHAIN = [
    Vector((-2.80, 3.30, -0.30)),
    Vector((-3.50, 6.40, -0.50)),
    Vector((-5.30, 9.70, -2.50)),
    Vector((-5.60, 11.40, -4.10)),
]

FOREARM_LENGTH = 250.0  # mm, pushed out of frame below the book


@dataclass
class BoneSpec:
    name: str
    parent: str | None
    head: Vector
    tail: Vector
    dorsal: Vector


def build_bones() -> list[BoneSpec]:
    bones: list[BoneSpec] = []
    dorsal = DORSAL
    wrist_head = canonical_to_blender(WRIST_JOINT)
    wrist_tail = canonical_to_blender(PALM_BASE)
    forearm_tail = wrist_head.copy()
    forearm_head = wrist_head - Vector((0.0, 0.0, FOREARM_LENGTH))

    bones.append(BoneSpec("forearm", None, forearm_head, forearm_tail, dorsal))
    bones.append(BoneSpec("wrist", "forearm", wrist_head, wrist_tail, dorsal))
    bones.append(
        BoneSpec(
            "palm",
            "wrist",
            wrist_tail,
            canonical_to_blender(KNUCKLE_CENTER),
            dorsal,
        )
    )

    for finger in ("index", "middle", "ring", "pinky"):
        mcp = canonical_to_blender(MCP_CANON[finger])
        tip = canonical_to_blender(to_canonical(TIPS_RAW[finger]))
        uri = mcp.lerp(tip, 0.50)
        dip = mcp.lerp(tip, 0.77)
        bones.append(BoneSpec(f"metacarpal_{finger}", "palm", wrist_tail, mcp, dorsal))
        bones.append(BoneSpec(f"{finger}_01", f"metacarpal_{finger}", mcp, uri, dorsal))
        bones.append(BoneSpec(f"{finger}_02", f"{finger}_01", uri, dip, dorsal))
        bones.append(BoneSpec(f"{finger}_03", f"{finger}_02", dip, tip, dorsal))

    thumb = [canonical_to_blender(p) for p in THUMB_CHAIN]
    bones.append(BoneSpec("thumb_01", "wrist", thumb[0], thumb[1], dorsal))
    bones.append(BoneSpec("thumb_02", "thumb_01", thumb[1], thumb[2], dorsal))
    bones.append(BoneSpec("thumb_03", "thumb_02", thumb[2], thumb[3], dorsal))
    return bones


# ---------------------------------------------------------------------------
# Mesh import
# ---------------------------------------------------------------------------


def read_obj(path: Path) -> tuple[list[Vector], list[list[int]]]:
    verts: list[Vector] = []
    faces: list[list[int]] = []
    for line in path.read_text().splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v":
            verts.append(Vector((float(parts[1]), float(parts[2]), float(parts[3]))))
        elif parts[0] == "f":
            faces.append([int(tok.split("/")[0]) - 1 for tok in parts[1:]])
    return verts, faces


def build_hand_mesh(verts: list[Vector], faces: list[list[int]]) -> bpy.types.Object:
    bpy.ops.wm.read_factory_settings(use_empty=True)

    transformed = [canonical_to_blender(to_canonical(v)) for v in verts]
    mesh = bpy.data.meshes.new("HandMesh")
    mesh.from_pydata([tuple(v) for v in transformed], [], faces)
    mesh.validate()
    mesh.update()

    hand = bpy.data.objects.new("Hand", mesh)
    bpy.context.collection.objects.link(hand)
    bpy.context.view_layer.objects.active = hand

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    for poly in hand.data.polygons:
        poly.use_smooth = True

    material = bpy.data.materials.new("Hand_Skin")
    material.use_nodes = True
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = (0.026, 0.014, 0.010, 1.0)
    principled.inputs["Roughness"].default_value = 0.78
    if "Subsurface Weight" in principled.inputs:
        principled.inputs["Subsurface Weight"].default_value = 0.08
    hand.data.materials.append(material)

    return hand


def add_forearm(hand: bpy.types.Object) -> None:
    """Loft a tapered forearm from the wrist ring so the cut never reaches frame."""
    verts = [v.co for v in hand.data.vertices]
    wrist_z = canonical_to_blender(WRIST_JOINT).z
    wrist_ring = [v for v in verts if v.z < wrist_z + 14.0]
    if not wrist_ring:
        wrist_ring = [v for v in verts if v.z < wrist_z]
    cx = sum(v.x for v in wrist_ring) / len(wrist_ring)
    cy = sum(v.y for v in wrist_ring) / len(wrist_ring)
    cz = sum(v.z for v in wrist_ring) / len(wrist_ring)
    radius = sum(math.hypot(v.x - cx, v.y - cy) for v in wrist_ring) / len(wrist_ring)

    rings = 10
    segments = 24
    length = FOREARM_LENGTH - 5.0
    start_z = cz + 6.0
    sleeve_verts: list[tuple[float, float, float]] = []
    sleeve_faces: list[list[int]] = []

    for ring in range(rings + 1):
        t = ring / rings
        z = start_z - length * t
        r = radius * (1.02 + 0.62 * t)
        for seg in range(segments):
            angle = 2.0 * math.pi * seg / segments
            sleeve_verts.append(
                (
                    cx + math.cos(angle) * r,
                    cy + math.sin(angle) * r * 0.86,
                    z,
                )
            )

    for ring in range(rings):
        for seg in range(segments):
            nxt = (seg + 1) % segments
            a = ring * segments + seg
            b = ring * segments + nxt
            c = (ring + 1) * segments + nxt
            d = (ring + 1) * segments + seg
            sleeve_faces.append([a, b, c, d])

    cap = len(sleeve_verts)
    sleeve_verts.append((cx, cy, start_z - length))
    last = rings * segments
    for seg in range(segments):
        nxt = (seg + 1) % segments
        sleeve_faces.append([last + seg, last + nxt, cap])

    top_cap = len(sleeve_verts)
    sleeve_verts.append((cx, cy, start_z))
    for seg in range(segments):
        nxt = (seg + 1) % segments
        sleeve_faces.append([nxt, seg, top_cap])

    sleeve_mesh = bpy.data.meshes.new("ForearmSleeve")
    sleeve_mesh.from_pydata(sleeve_verts, [], sleeve_faces)
    sleeve_mesh.validate()
    sleeve_mesh.update()
    sleeve = bpy.data.objects.new("ForearmSleeve", sleeve_mesh)
    bpy.context.collection.objects.link(sleeve)

    bm = bmesh.new()
    bm.from_mesh(sleeve_mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(sleeve_mesh)
    bm.free()
    for poly in sleeve.data.polygons:
        poly.use_smooth = True
    sleeve.data.materials.append(hand.data.materials[0])

    bpy.ops.object.select_all(action="DESELECT")
    sleeve.select_set(True)
    hand.select_set(True)
    bpy.context.view_layer.objects.active = hand
    bpy.ops.object.join()


# ---------------------------------------------------------------------------
# Armature + skinning
# ---------------------------------------------------------------------------


def build_armature(specs: list[BoneSpec]) -> bpy.types.Object:
    arm_data = bpy.data.armatures.new("HandArmature")
    armature = bpy.data.objects.new("HandArmature", arm_data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")

    edit_bones: dict[str, bpy.types.EditBone] = {}
    for spec in specs:
        bone = arm_data.edit_bones.new(spec.name)
        bone.head = spec.head
        bone.tail = spec.tail
        bone.align_roll(spec.dorsal)
        if spec.parent and spec.parent in edit_bones:
            bone.parent = edit_bones[spec.parent]
            if (bone.head - bone.parent.tail).length < 0.5:
                bone.use_connect = True
        edit_bones[spec.name] = bone

    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def bind(hand: bpy.types.Object, armature: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    hand.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    hand.data.validate()
    bpy.context.view_layer.objects.active = hand
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)

    unweighted = [
        v.index for v in hand.data.vertices if not v.groups
    ]
    if unweighted:
        forearm_group = hand.vertex_groups.get("forearm")
        if forearm_group is None:
            forearm_group = hand.vertex_groups.new(name="forearm")
        forearm_group.add(unweighted, 1.0, "REPLACE")
        print(f"WEIGHT_FALLBACK={len(unweighted)}")


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def export(hand: bpy.types.Object, armature: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    hand.select_set(True)
    bpy.context.view_layer.objects.active = armature

    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "hand-rig.blend"))

    bpy.ops.export_scene.gltf(
        filepath=str(MODELS / "hand.glb"),
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
    print(f"HAND_TRIS={tris} BONES={len(armature.data.bones)} VERTS={len(hand.data.vertices)}")


def pose_probe(hand: bpy.types.Object, armature: bpy.types.Object) -> None:
    """Flex every digit and print how far the skin actually travels.

    A curl applied around each bone's local X must pull the fingertips toward
    -Z (the palm). If a roll were wrong the probe would show the opposite sign.
    """
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = hand.evaluated_get(depsgraph)
    before = [evaluated.matrix_world @ v.co for v in evaluated.data.vertices]

    for bone in armature.pose.bones:
        if bone.name.endswith(("_01", "_02", "_03")):
            bone.rotation_mode = "XYZ"
            bone.rotation_euler[0] = math.radians(-35.0)

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = hand.evaluated_get(depsgraph)
    after = [evaluated.matrix_world @ v.co for v in evaluated.data.vertices]

    # Track the vertex that moves most: it is always a fingertip.
    moved = max(range(len(before)), key=lambda i: (after[i] - before[i]).length)
    print(
        "POSE_PROBE moved=%.1fmm delta=%s"
        % (
            (after[moved] - before[moved]).length,
            tuple(round(c, 1) for c in (after[moved] - before[moved])),
        )
    )

    for bone in armature.pose.bones:
        bone.rotation_euler[0] = 0.0
    bpy.ops.object.mode_set(mode="OBJECT")


def main() -> None:
    verts, faces = read_obj(SOURCE_OBJ)
    hand = build_hand_mesh(verts, faces)
    add_forearm(hand)

    specs = build_bones()
    armature = build_armature(specs)
    bind(hand, armature)

    print("CANONICAL AXES", tuple(round(c, 3) for c in AXIS_X), tuple(round(c, 3) for c in AXIS_Y))
    for spec in specs:
        head = to_mm(_blender_to_canonical(spec.head))
        tail = to_mm(_blender_to_canonical(spec.tail))
        print(
            "BONE %-18s head=(%6.1f %6.1f %6.1f) tail=(%6.1f %6.1f %6.1f)"
            % (spec.name, *head, *tail)
        )

    pose_probe(hand, armature)
    export(hand, armature)


def _blender_to_canonical(point: Vector) -> Vector:
    """Inverse of canonical_to_blender, in millimetres before the grip offset."""
    return Vector((point.x, point.z, -point.y)) / CM_TO_MM + GRIP_ORIGIN


if __name__ == "__main__":
    main()
