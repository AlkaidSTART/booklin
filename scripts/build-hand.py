#!/usr/bin/env python3
"""Build the grip blockout hand for Bookln.

Run:
  blender -b --python scripts/build-hand.py

Source units are millimetres, matching the book/slipcase pipeline; the runtime
wraps the GLB in a 0.001 group.

The hand is modelled already closed around a grip: the spine of the held object
runs along local X through the origin with GRIP_RADIUS, the palm sits behind it
on +Y, the fingers wrap over the top toward -Y, and the forearm leaves toward -Z.
Parts are built separately and fused with a voxel remesh so the knuckles read as
one continuous surface instead of assembled capsules.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "public" / "models"
SOURCE = MODELS / "source"
PREVIEW = Path("/tmp/bookln-hand")
SOURCE.mkdir(parents=True, exist_ok=True)
PREVIEW.mkdir(parents=True, exist_ok=True)

GRIP_RADIUS = 17.0
TARGET_TRIS = 12000

# centre x, base radius, tip radius, tip height (lower = longer finger)
FINGERS = [
    ("index", -37.0, 9.6, 7.0, 11.0),
    ("middle", -12.5, 10.0, 7.4, 6.0),
    ("ring", 12.0, 9.5, 7.0, 9.0),
    ("pinky", 35.0, 8.4, 6.0, 17.0),
]

parts: list[bpy.types.Object] = []


def ball(position: tuple[float, float, float], radius: float, scale=(1.0, 1.0, 1.0)) -> None:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=24,
        ring_count=16,
        radius=radius,
        location=position,
    )
    obj = bpy.context.active_object
    obj.scale = scale
    parts.append(obj)


def segment(a, b, radius_a: float, radius_b: float) -> None:
    start, end = Vector(a), Vector(b)
    direction = end - start
    bpy.ops.mesh.primitive_cone_add(
        vertices=24,
        radius1=radius_a,
        radius2=radius_b,
        depth=direction.length,
        location=(start + end) * 0.5,
    )
    obj = bpy.context.active_object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    parts.append(obj)


def build_parts() -> None:
    # Palm: a flattened mass behind the grip, wide across the knuckles.
    ball((0.0, 40.0, 2.0), 48.0, (0.98, 0.38, 1.06))
    # Thenar pad, so the thumb root has volume to grow from.
    ball((-34.0, 34.0, -22.0), 26.0, (1.0, 0.8, 0.9))

    # Forearm: leaves the frame, with a wrist taper so it is not a tree trunk.
    ball((0.0, 42.0, -40.0), 29.0, (1.0, 0.92, 1.0))
    segment((0.0, 42.0, -52.0), (0.0, 50.0, -300.0), 27.0, 44.0)
    ball((0.0, 50.0, -300.0), 44.0, (1.0, 0.94, 1.0))

    for _name, x, radius_base, radius_tip, tip_z in FINGERS:
        knuckle = (x, 26.0, 42.0)
        first = (x, 4.0, 47.0)
        second = (x, -14.0, 32.0)
        tip = (x, -18.0, tip_z)

        steps = [
            (knuckle, first, radius_base, radius_base * 0.94),
            (first, second, radius_base * 0.94, radius_base * 0.88),
            (second, tip, radius_base * 0.88, radius_tip),
        ]
        for start, end, ra, rb in steps:
            segment(start, end, ra, rb)
        # Knuckles sit proud of the shafts, which is what stops the fingers
        # reading as four identical tubes.
        ball(knuckle, radius_base * 1.16, (1.0, 1.0, 1.0))
        ball(first, radius_base * 1.04)
        ball(second, radius_base * 0.96)
        ball(tip, radius_tip)

    # Thumb crosses in front of the index and middle rather than standing beside
    # them; the palm's thenar pad is what it grows out of.
    thumb = [
        ((-44.0, 28.0, -20.0), (-57.0, 6.0, -10.0), 16.0, 13.5),
        ((-57.0, 6.0, -10.0), (-48.0, -20.0, 6.0), 13.5, 11.5),
        ((-48.0, -20.0, 6.0), (-18.0, -27.0, 17.0), 11.5, 9.0),
    ]
    for start, end, ra, rb in thumb:
        segment(start, end, ra, rb)
    for point, radius in (
        ((-44.0, 28.0, -20.0), 16.0),
        ((-57.0, 6.0, -10.0), 13.5),
        ((-48.0, -20.0, 6.0), 11.5),
        ((-18.0, -27.0, 17.0), 9.0),
    ):
        ball(point, radius)


def fuse(parts_objects: list[bpy.types.Object]) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts_objects[0]
    bpy.ops.object.join()

    hand = bpy.context.active_object
    hand.name = "HandBlockout"
    hand.data.name = "HandBlockout"

    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    remesh = hand.modifiers.new("Remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = 1.6
    remesh.use_smooth_shade = True

    smooth = hand.modifiers.new("Smooth", "SMOOTH")
    smooth.factor = 0.6
    smooth.iterations = 6

    bpy.context.view_layer.objects.active = hand
    bpy.ops.object.modifier_apply(modifier="Remesh")

    current = sum(len(p.vertices) - 2 for p in hand.data.polygons)
    if current > TARGET_TRIS:
        decimate = hand.modifiers.new("Decimate", "DECIMATE")
        decimate.ratio = TARGET_TRIS / current
        bpy.ops.object.modifier_apply(modifier="Decimate")

    bpy.ops.object.modifier_apply(modifier="Smooth")

    # Put the grip centre (the hole the held object sits in) on the origin, so
    # the runtime can attach it straight to a socket without magic offsets.
    hand.location = (0.0, -2.0, -24.0)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    bpy.ops.object.shade_smooth()
    return hand


def skin_material(obj: bpy.types.Object) -> None:
    material = bpy.data.materials.new("Hand_Skin")
    material.use_nodes = True
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = (0.125, 0.086, 0.072, 1.0)
    principled.inputs["Roughness"].default_value = 0.56
    principled.inputs["Specular IOR Level"].default_value = 0.4
    obj.data.materials.append(material)


def preview_rig() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.color = (0.015, 0.013, 0.012)

    camera = bpy.data.objects.new("PreviewCamera", bpy.data.cameras.new("PreviewCamera"))
    bpy.context.collection.objects.link(camera)
    camera.data.lens = 70
    scene.camera = camera

    key = bpy.data.objects.new("PreviewKey", bpy.data.lights.new("PreviewKey", "AREA"))
    bpy.context.collection.objects.link(key)
    key.location = (180.0, 240.0, 260.0)
    key.data.energy = 1200000
    key.data.size = 200
    key.rotation_euler = (math.radians(38), 0.0, math.radians(36))

    rim = bpy.data.objects.new("PreviewRim", bpy.data.lights.new("PreviewRim", "AREA"))
    bpy.context.collection.objects.link(rim)
    rim.location = (-240.0, -220.0, 40.0)
    rim.data.energy = 600000
    rim.data.size = 140
    rim.rotation_euler = (math.radians(80), 0.0, math.radians(-125))


def render_preview(name: str, location: tuple[float, float, float], target: Vector) -> None:
    camera = bpy.data.objects["PreviewCamera"]
    camera.location = location
    camera.rotation_euler = (target - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = str(PREVIEW / f"{name}.png")
    bpy.ops.render.render(write_still=True)


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_parts()
    hand = fuse(parts)
    skin_material(hand)

    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "hand-blockout.blend"))

    bpy.ops.object.select_all(action="DESELECT")
    hand.select_set(True)
    bpy.context.view_layer.objects.active = hand
    bpy.ops.export_scene.gltf(
        filepath=str(MODELS / "hand-blockout.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_yup=True,
    )

    print("HAND_TRIS", sum(len(p.vertices) - 2 for p in hand.data.polygons))

    preview_rig()
    render_preview("front", (30.0, -420.0, 70.0), Vector((0.0, 16.0, 0.0)))
    render_preview("side", (430.0, -90.0, 40.0), Vector((0.0, 16.0, 0.0)))
    render_preview("top", (50.0, -110.0, 430.0), Vector((0.0, 16.0, 0.0)))


if __name__ == "__main__":
    main()
