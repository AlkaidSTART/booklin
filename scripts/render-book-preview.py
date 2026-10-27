#!/usr/bin/env python3
"""Render closed/open editorial previews from the packed source .blend."""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
BLEND = ROOT / "public" / "models" / "source" / "book-codex-1.blend"
OUT = ROOT / "docs" / "design"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BLEND))
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.studio_light = "rim.sl"
scene.display.shading.color_type = "TEXTURE"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = "WORLD"
scene.display.shading.curvature_ridge_factor = 1.4
scene.display.shading.curvature_valley_factor = 1.2
scene.display.shading.background_type = "WORLD"
scene.display.shading.background_color = (0.015, 0.011, 0.009)
scene.display.render_aa = "8"
scene.render.resolution_x = 1200
scene.render.resolution_y = 1500
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.look = "AgX - Medium High Contrast"

# Dark warm studio.
world = bpy.data.worlds.new("Preview_World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.009, 0.007, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.22
scene.world = world


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

# Camera: three-quarter hero view.
bpy.ops.object.camera_add(location=(330, -590, 230))
cam = bpy.context.object
cam.data.lens = 72
cam.data.sensor_width = 36
look_at(cam, (0, 0, 105))
scene.camera = cam

# Lights.
for name, loc, energy, size, color in [
    ("Key", (-350, -430, 470), 950, 280, (1.0, 0.74, 0.52)),
    ("Rim", (390, 210, 350), 1050, 220, (1.0, 0.84, 0.64)),
    ("Fill", (100, -250, 150), 300, 240, (0.72, 0.78, 1.0)),
]:
    bpy.ops.object.light_add(type="AREA", location=loc)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    look_at(light, (0, 0, 105))

# Soft floor.
bpy.ops.mesh.primitive_plane_add(size=1600, location=(0, 0, -12))
floor = bpy.context.object
mat = bpy.data.materials.new("Preview_Floor")
mat.diffuse_color = (0.018, 0.014, 0.011, 1)
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.018, 0.014, 0.011, 1)
bsdf.inputs["Roughness"].default_value = 0.42
floor.data.materials.append(mat)

book = bpy.data.objects.get("Book_CODEX_1")
if not book:
    raise RuntimeError("Book_CODEX_1 not found in source blend")
# Add a subtle depth rim by slightly moving camera target.
for key in book.data.shape_keys.key_blocks:
    key.value = 0.0
book.data.shape_keys.key_blocks["Key_Closed"].value = 1.0
scene.render.filepath = str(OUT / "book-preview-closed.png")
bpy.ops.render.render(write_still=True)
for key in book.data.shape_keys.key_blocks:
    key.value = 0.0
book.data.shape_keys.key_blocks["Key_HalfOpen"].value = 0.55
book.data.shape_keys.key_blocks["Key_Flat"].value = 0.45
cam.location = (520, -760, 300)
look_at(cam, (-15, 0, 100))
scene.render.filepath = str(OUT / "book-preview-open.png")
bpy.ops.render.render(write_still=True)
print("rendered previews", OUT)
