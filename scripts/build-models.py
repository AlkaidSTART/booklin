#!/usr/bin/env python3
"""Build deterministic Bookln GLB assets in Blender 5.x.

Run:
  blender -b --python scripts/build-models.py

Source units are millimetres. Blender is Z-up; glTF export converts to Y-up.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "public" / "models"
SOURCE = MODELS / "source"
TEX = ROOT / "public" / "textures" / "source"
SOURCE.mkdir(parents=True, exist_ok=True)

REGIONS = {
    "front-cover": (0.00, 0.50, 0.50, 1.00),
    "back-cover": (0.50, 0.50, 1.00, 1.00),
    "spine": (0.00, 0.25, 0.25, 0.50),
    "page-0": (0.25, 0.25, 0.50, 0.50),
    "page-1": (0.50, 0.25, 0.75, 0.50),
    "page-2": (0.75, 0.25, 1.00, 0.50),
    "page-3": (0.00, 0.00, 0.25, 0.25),
    "page-4": (0.25, 0.00, 0.50, 0.25),
    "page-5": (0.50, 0.00, 0.75, 0.25),
    "ribbon": (0.75, 0.00, 1.00, 0.25),
}
FACE_SLOT = {
    "front": (0, 1),
    "back": (1, 1),
    "left": (2, 1),
    "right": (0, 0),
    "top": (1, 0),
    "bottom": (2, 0),
}


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def face_uv(region: tuple[float, float, float, float], face: str) -> tuple[float, float, float, float]:
    u0, v0, u1, v1 = region
    c, r = FACE_SLOT[face]
    du, dv = (u1 - u0) / 3.0, (v1 - v0) / 2.0
    return (u0 + c * du, v0 + r * dv, u0 + (c + 1) * du, v0 + (r + 1) * dv)


def image_node(nodes, path: Path, colorspace: str, x: float, y: float):
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(path), check_existing=True)
    node.image.colorspace_settings.name = colorspace
    node.location = (x, y)
    return node


def create_book_material():
    mat = bpy.data.materials.new("Book_PBR_Atlas")
    mat.use_nodes = True
    mat["texture_profile"] = "PBR metal-rough, AO baked"
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (680, 120)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (390, 120)
    bsdf.inputs["Base Color"].default_value = (0.08, 0.07, 0.06, 1)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.72
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    base = image_node(nodes, TEX / "book-basecolor.png", "sRGB", -820, 340)
    rough = image_node(nodes, TEX / "book-roughness.png", "Non-Color", -820, 80)
    metal = image_node(nodes, TEX / "book-metalness.png", "Non-Color", -820, -180)
    normal = image_node(nodes, TEX / "book-normal.png", "Non-Color", -820, -440)
    ao = image_node(nodes, TEX / "book-ao.png", "Non-Color", -820, -700)
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(metal.outputs["Color"], bsdf.inputs["Metallic"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.location = (-330, -440)
    nmap.inputs["Strength"].default_value = 0.65
    links.new(normal.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    # Dedicated glTF material output node for baked occlusion.
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket("Occlusion", socket_type="NodeSocketFloat")
        group.nodes.new("NodeGroupOutput")
        group.nodes.new("NodeGroupInput")
    group_node = nodes.new("ShaderNodeGroup")
    group_node.node_tree = group
    group_node.location = (390, -260)
    links.new(ao.outputs["Color"], group_node.inputs["Occlusion"])
    return mat


def create_oak_material():
    mat = bpy.data.materials.new("Oak_PBR")
    mat.use_nodes = True
    mat["texture_profile"] = "oak basecolor/normal/roughness"
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (620, 120)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (340, 120)
    bsdf.inputs["Roughness"].default_value = 0.56
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    base = image_node(nodes, TEX / "oak-basecolor.png", "sRGB", -820, 320)
    rough = image_node(nodes, TEX / "oak-roughness.png", "Non-Color", -820, 60)
    normal = image_node(nodes, TEX / "oak-normal.png", "Non-Color", -820, -200)
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.location = (-340, -200)
    nmap.inputs["Strength"].default_value = 0.55
    links.new(normal.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_simple_material(name: str, color: tuple[float, float, float, float], metallic=0.0, roughness=0.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


class MeshBuilder:
    def __init__(self):
        self.verts: list[tuple[float, float, float]] = []
        self.faces: list[tuple[int, ...]] = []
        self.uvs: list[tuple[float, float]] = []
        self.materials: list[int] = []
        self.parts: dict[str, tuple[int, int]] = {}

    def add_grid_box(
        self,
        name: str,
        x0: float,
        x1: float,
        y0: float,
        y1: float,
        z0: float,
        z1: float,
        region: tuple[float, float, float, float],
        material: int = 0,
        nx: int = 1,
        nz: int = 1,
    ) -> None:
        start = len(self.verts)
        # Front (-Y) and back (+Y) grids.
        for y, face in ((y0, "front"), (y1, "back")):
            face_base = len(self.verts)
            for iz in range(nz + 1):
                for ix in range(nx + 1):
                    self.verts.append((x0 + (x1 - x0) * ix / nx, y, z0 + (z1 - z0) * iz / nz))
            u0, v0, u1, v1 = face_uv(region, face)
            for iz in range(nz):
                for ix in range(nx):
                    a = face_base + iz * (nx + 1) + ix
                    b = a + 1
                    c = a + (nx + 1) + 1
                    d = a + (nx + 1)
                    quad = (a, b, c, d) if face == "front" else (a, d, c, b)
                    self.faces.append(quad)
                    self.materials.append(material)
                    for uu, vv in (
                        (ix / nx, iz / nz),
                        ((ix + 1) / nx, iz / nz),
                        ((ix + 1) / nx, (iz + 1) / nz),
                        (ix / nx, (iz + 1) / nz),
                    ):
                        if face == "back":
                            uu = 1.0 - uu
                        self.uvs.append((u0 + uu * (u1 - u0), v0 + vv * (v1 - v0)))

        # Four side faces.
        side_specs = [
            ("left", [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)]),
            ("right", [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)]),
            ("top", [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]),
            ("bottom", [(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)]),
        ]
        for face, coords in side_specs:
            idx = len(self.verts)
            self.verts.extend(coords)
            if face in ("left", "right"):
                # Keep triangle winding consistent.
                order = (0, 2, 1, 3) if face == "right" else (0, 1, 2, 3)
            else:
                order = (0, 2, 1, 3) if face == "top" else (0, 1, 2, 3)
            self.faces.append(tuple(idx + i for i in order))
            self.materials.append(material)
            u0, v0, u1, v1 = face_uv(region, face)
            for uu, vv in ((0, 0), (1, 0), (1, 1), (0, 1)):
                self.uvs.append((u0 + uu * (u1 - u0), v0 + vv * (v1 - v0)))
        self.parts[name] = (start, len(self.verts))

    def add_cylinder(
        self,
        name: str,
        radius: float,
        height: float,
        z0: float,
        y0: float,
        segments: int,
        material: int,
    ) -> None:
        start = len(self.verts)
        bottom_center = len(self.verts)
        self.verts.append((0, y0, z0))
        top_center = len(self.verts)
        self.verts.append((0, y0, z0 + height))
        bottom_ring = len(self.verts)
        for i in range(segments):
            a = 2 * math.pi * i / segments
            self.verts.append((radius * math.cos(a), y0 + radius * math.sin(a), z0))
        top_ring = len(self.verts)
        for i in range(segments):
            a = 2 * math.pi * i / segments
            self.verts.append((radius * math.cos(a), y0 + radius * math.sin(a), z0 + height))
        for i in range(segments):
            j = (i + 1) % segments
            self.faces.append((bottom_center, bottom_ring + i, bottom_ring + j))
            self.faces.append((top_center, top_ring + j, top_ring + i))
            self.faces.append((bottom_ring + i, top_ring + i, top_ring + j, bottom_ring + j))
            self.materials.extend([material, material, material])
            self.uvs.extend([(0.08, 0.08)] * 10)
        self.parts[name] = (start, len(self.verts))

    def add_front_disc(
        self,
        name: str,
        radius: float,
        thickness: float,
        y: float,
        z_center: float,
        segments: int,
        material: int,
    ) -> None:
        start = len(self.verts)
        y_front, y_back = y - thickness / 2, y + thickness / 2
        front_center = len(self.verts)
        self.verts.append((0, y_front, z_center))
        back_center = len(self.verts)
        self.verts.append((0, y_back, z_center))
        front_ring = len(self.verts)
        for i in range(segments):
            a = 2 * math.pi * i / segments
            self.verts.append((radius * math.cos(a), y_front, z_center + radius * math.sin(a)))
        back_ring = len(self.verts)
        for i in range(segments):
            a = 2 * math.pi * i / segments
            self.verts.append((radius * math.cos(a), y_back, z_center + radius * math.sin(a)))
        for i in range(segments):
            j = (i + 1) % segments
            self.faces.append((front_center, front_ring + j, front_ring + i))
            self.faces.append((back_center, back_ring + i, back_ring + j))
            self.faces.append((front_ring + i, front_ring + j, back_ring + j, back_ring + i))
            self.materials.extend([material, material, material])
            self.uvs.extend([(0.1, 0.1)] * 10)
        self.parts[name] = (start, len(self.verts))

    def to_object(self, name: str, materials: list[bpy.types.Material]):
        mesh = bpy.data.meshes.new(name + "_Mesh")
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.update()
        uv_layer = mesh.uv_layers.new(name="UVMap")
        for poly in mesh.polygons:
            for loop_idx in poly.loop_indices:
                loop = mesh.loops[loop_idx]
                uv_layer.data[loop_idx].uv = self.uvs[loop_idx]
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for mat in materials:
            obj.data.materials.append(mat)
        for poly, mat_idx in zip(mesh.polygons, self.materials):
            poly.material_index = mat_idx
        # Triangulate without changing component ownership.
        tri = obj.modifiers.new("Triangulate_For_Export", "TRIANGULATE")
        tri.quad_method = "BEAUTY"
        tri.ngon_method = "BEAUTY"
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=tri.name)
        obj.select_set(False)
        return obj


def rotate_about_spine(x: float, y: float, angle_deg: float) -> tuple[float, float]:
    a = math.radians(angle_deg)
    dx, dy = x + 74.0, y
    return (-74.0 + math.cos(a) * dx - math.sin(a) * dy, math.sin(a) * dx + math.cos(a) * dy)


def add_book_shape_keys(obj: bpy.types.Object, builder: MeshBuilder) -> None:
    obj.shape_key_add(name="Basis", from_mix=False)
    closed = obj.shape_key_add(name="Key_Closed", from_mix=False)
    half = obj.shape_key_add(name="Key_HalfOpen", from_mix=False)
    flat = obj.shape_key_add(name="Key_Flat", from_mix=False)
    base_positions = [v.co.copy() for v in obj.data.vertices]
    for i, co in enumerate(base_positions):
        closed.data[i].co = co
        half.data[i].co = co
        flat.data[i].co = co

    component_angles_half = {
        "Front_Cover": 48.0,
        "Back_Cover": 0.0,
        "Spine": 0.0,
        "Ribbon": 18.0,
    }
    component_angles_flat = {
        "Front_Cover": 180.0,
        "Back_Cover": 0.0,
        "Spine": 0.0,
        "Ribbon": 154.0,
    }
    for i in range(6):
        component_angles_half[f"Page_Layer_{i+1}"] = 8.0 + i * 6.0
        component_angles_flat[f"Page_Layer_{i+1}"] = 174.0 + i * 1.0
    for part, (start, end) in builder.parts.items():
        for key, angles in ((half, component_angles_half), (flat, component_angles_flat)):
            angle = angles.get(part, 0.0)
            if abs(angle) < 1e-9:
                continue
            for i in range(start, end):
                x, y, z = base_positions[i]
                key.data[i].co = (*rotate_about_spine(x, y, angle), z)
    for key in (closed, half, flat):
        key.value = 0.0


def build_book() -> None:
    reset()
    mat = create_book_material()
    b = MeshBuilder()
    # Outer bounds exactly 148 x 30 x 210 mm.
    b.add_grid_box("Front_Cover", -74, 74, -15.0, -12.6, 0, 210, REGIONS["front-cover"], nx=8, nz=12)
    b.add_grid_box("Back_Cover", -74, 74, 12.6, 15.0, 0, 210, REGIONS["back-cover"], nx=8, nz=12)
    b.add_grid_box("Spine", -74, -71, -15, 15, 0, 210, REGIONS["spine"], nx=2, nz=12)
    # Six page layers, 4 mm nominal thickness plus hairline gaps.
    page_y0, page_y1 = -12.35, 12.35
    step = (page_y1 - page_y0) / 6.0
    for i in range(6):
        y0 = page_y0 + i * step + 0.035
        y1 = page_y0 + (i + 1) * step - 0.035
        b.add_grid_box(f"Page_Layer_{i+1}", -71, 72, y0, y1, 2.0, 208.0, REGIONS[f"page-{i}"], nx=10, nz=14)
    b.add_grid_box("Ribbon", 39, 47, -12.5, -12.1, -8, 206, REGIONS["ribbon"], nx=1, nz=24)
    obj = b.to_object("Book_CODEX_1", [mat])
    add_book_shape_keys(obj, b)
    obj["asset_id"] = "A1-BOOK-CODEX-1"
    obj["units"] = "millimeters"
    obj["dimensions_mm"] = "148 x 210 x 30"
    obj["forward_axis_gltf"] = "+Z"
    obj["up_axis_gltf"] = "+Y"
    obj["origin"] = "bottom centre; scale applied 1:1"
    obj["morph_targets"] = "Key_Closed,Key_HalfOpen,Key_Flat"
    obj["material_profile"] = "PBR atlas, baked AO, tangent-space normal"

    # Save packed Blender source first so it remains editable.
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "book-codex-1.blend"))
    # Export only the book; no cameras/lights.
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(SOURCE / "book-codex-1-raw.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_morph=True,
        export_morph_normal=True,
        export_try_sparse_sk=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_yup=True,
    )
    print("BOOK_PARTS", {k: v[1] - v[0] for k, v in b.parts.items()})
    print("BOOK_TRIS", sum(len(p.vertices) - 2 for p in obj.data.polygons))


def build_slipcase() -> None:
    reset()
    cloth = create_simple_material("Slipcase_Black_Cloth", (0.025, 0.022, 0.019, 1), 0.0, 0.86)
    gold = create_simple_material("Slipcase_Foil_Seal", (0.57, 0.43, 0.23, 1), 0.85, 0.28)
    inner = create_simple_material("Slipcase_Inner_Tray", (0.075, 0.065, 0.052, 1), 0.0, 0.9)
    objects = []
    # Open-front slipcase frame.
    pieces = [
        ("Slipcase_Back", (-80, -80, 16, 19, 0, 220), cloth, 1, 1),
        ("Slipcase_Left", (-80, -77, -19, 19, 0, 220), cloth, 1, 1),
        ("Slipcase_Right", (77, 80, -19, 19, 0, 220), cloth, 1, 1),
        ("Slipcase_Top", (-80, 80, -19, 19, 217, 220), cloth, 1, 1),
        ("Slipcase_Bottom", (-80, 80, -19, 19, 0, 3), cloth, 1, 1),
    ]
    for name, coords, mat, nx, nz in pieces:
        x0, x1, y0, y1, z0, z1 = coords
        b = MeshBuilder()
        b.add_grid_box(name, x0, x1, y0, y1, z0, z1, (0.04, 0.04, 0.96, 0.96), nx=nx, nz=nz)
        obj = b.to_object(name, [mat])
        objects.append(obj)
    # Separate liner group: thin walls preserve the cavity for the book.
    liner = MeshBuilder()
    liner.add_grid_box("Liner_Back", -75, 75, 15.5, 16.0, 4, 216, (0.08, 0.08, 0.92, 0.92), nx=1, nz=1)
    liner.add_grid_box("Liner_Left", -75.0, -74.5, -15.5, 15.5, 4, 216, (0.08, 0.08, 0.92, 0.92), nx=1, nz=1)
    liner.add_grid_box("Liner_Right", 74.5, 75.0, -15.5, 15.5, 4, 216, (0.08, 0.08, 0.92, 0.92), nx=1, nz=1)
    liner.add_grid_box("Liner_Bottom", -75, 75, -15.5, 15.5, 4, 4.5, (0.08, 0.08, 0.92, 0.92), nx=1, nz=1)
    objects.append(liner.to_object("Slipcase_Inner_Tray", [inner]))
    # Flap pivots independently at the top of the open face.
    b = MeshBuilder()
    b.add_grid_box("Slipcase_Flap", -77, 77, -20.5, -19.0, 0, 130, (0.04, 0.04, 0.96, 0.96), nx=2, nz=4)
    flap = b.to_object("Slipcase_Flap", [cloth])
    flap["pivot"] = "top edge"
    objects.append(flap)
    # Wax-seal-like foil medallion.
    b = MeshBuilder()
    b.add_front_disc("Slipcase_Seal", 18, 2.0, -21.4, 88, 32, 0)
    seal = b.to_object("Slipcase_Seal", [gold])
    objects.append(seal)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "slipcase.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(SOURCE / "slipcase-raw.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_yup=True,
    )
    print("SLIPCASE_OBJECTS", [o.name for o in objects])
    print("SLIPCASE_TRIS", sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects))


def bevel_object(obj: bpy.types.Object, width: float, segments: int = 2) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new("Edge_Soften", "BEVEL")
    mod.width = width
    mod.segments = segments
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def build_desk_and_pedestal() -> None:
    reset()
    oak = create_oak_material()
    # Desk: 1600 x 900 x 760 mm overall, top plate 45 mm.
    parts = []
    b = MeshBuilder()
    b.add_grid_box("Desk_Top", -800, 800, -450, 450, 715, 760, (0.02, 0.02, 0.98, 0.98), nx=4, nz=2)
    top = b.to_object("Oak_Desk_Top", [oak])
    parts.append(top)
    for name, x, y in (("FL", -710, -360), ("FR", 710, -360), ("BL", -710, 360), ("BR", 710, 360)):
        b = MeshBuilder()
        b.add_grid_box(f"Desk_Leg_{name}", x - 35, x + 35, y - 35, y + 35, 0, 715, (0.02, 0.02, 0.98, 0.98))
        parts.append(b.to_object(f"Desk_Leg_{name}", [oak]))
    for p in parts:
        bevel_object(p, 4, 2)
        p.select_set(True)
    bpy.context.view_layer.objects.active = top
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "oak-desk.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(SOURCE / "oak-desk-raw.glb"),
        export_format="GLB", use_selection=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_extras=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_yup=True,
    )
    print("DESK_TRIS", sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts))

    reset()
    dark = create_simple_material("Pedestal_Bronze_Black", (0.045, 0.032, 0.022, 1), 0.55, 0.34)
    b = MeshBuilder()
    b.add_cylinder("Pedestal", 155, 120, 0, 0, 64, 0)
    ped = b.to_object("Display_Pedestal", [dark])
    bevel_object(ped, 3, 2)
    ped.select_set(True)
    bpy.context.view_layer.objects.active = ped
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "display-pedestal.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(SOURCE / "display-pedestal-raw.glb"),
        export_format="GLB", use_selection=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_extras=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_yup=True,
    )
    print("PEDESTAL_TRIS", sum(len(p.vertices) - 2 for p in ped.data.polygons))


def build_shelf() -> None:
    """Asset C1/C2: shared shelf for chapters 00 (Shelf) and 06 (Return).

    Local axes (mm, Blender Z-up): X along the shelf, Y depth (+Y is the back panel),
    Z height. Sleeping spines are one object so they can be hidden independently; the
    hero spine and its 0.00 W breathing strip are separate objects.
    """
    import random

    reset()
    rng = random.Random(1042)
    wood = create_simple_material("Shelf_Walnut", (0.045, 0.030, 0.018, 1), 0.0, 0.78)
    back = create_simple_material("Shelf_Back_Panel", (0.020, 0.016, 0.012, 1), 0.0, 0.92)
    spine_palette = [
        create_simple_material(f"Sleeping_Spine_{i}", color, 0.0, 0.82)
        for i, color in enumerate(
            [
                (0.030, 0.026, 0.022, 1),
                (0.040, 0.030, 0.024, 1),
                (0.024, 0.028, 0.030, 1),
                (0.046, 0.038, 0.028, 1),
                (0.034, 0.022, 0.020, 1),
            ]
        )
    ]
    hero = create_simple_material("Hero_Spine_Cloth", (0.050, 0.040, 0.030, 1), 0.0, 0.7)
    glow = create_simple_material("Hero_Spine_Glow", (0.80, 0.58, 0.24, 1), 0.0, 0.5)
    bsdf = glow.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.68, 0.28, 1)
    bsdf.inputs["Emission Strength"].default_value = 0.6

    width, depth, height, board = 1400.0, 300.0, 1800.0, 24.0
    region = (0.04, 0.04, 0.96, 0.96)
    objects = []

    frame = MeshBuilder()
    frame.add_grid_box("Side_L", -width / 2, -width / 2 + board, 0, depth, 0, height, region, 0)
    frame.add_grid_box("Side_R", width / 2 - board, width / 2, 0, depth, 0, height, region, 0)
    board_heights = [330.0, 800.0, 1270.0, height - board]
    for i, z in enumerate(board_heights):
        frame.add_grid_box(f"Board_{i}", -width / 2, width / 2, 0, depth, z, z + board, region, 0)
    objects.append(frame.to_object("Shelf_Frame", [wood]))

    panel = MeshBuilder()
    panel.add_grid_box("Back", -width / 2, width / 2, depth - 10, depth, 0, height, region, 0)
    objects.append(panel.to_object("Shelf_Back_Panel", [back]))

    sleeping = MeshBuilder()
    inner_l, inner_r = -width / 2 + board + 8, width / 2 - board - 8
    hero_x, hero_w, hero_h = -140.0, 38.0, 232.0
    for row, board_z in enumerate((800.0 + board, 1270.0 + board)):
        x = inner_l
        while x < inner_r - 20:
            w = rng.uniform(20, 46)
            h = rng.uniform(190, 262)
            if row == 0 and hero_x - 14 < x + w and x < hero_x + hero_w + 14:
                x = hero_x + hero_w + 14  # leave a gap for the hero book
                continue
            if x + w > inner_r:
                break
            sleeping.add_grid_box(
                f"Sleep_{row}_{int(x)}", x, x + w, 40, 40 + rng.uniform(150, 205), board_z, board_z + h,
                region, rng.randrange(len(spine_palette)),
            )
            x += w + rng.uniform(0.5, 3.0)
    objects.append(sleeping.to_object("Shelf_Books_Sleeping", spine_palette))

    hero_b = MeshBuilder()
    hero_z = 800.0 + board
    hero_b.add_grid_box("Hero_Spine", hero_x, hero_x + hero_w, 40, 40 + 190, hero_z, hero_z + hero_h, region, 0)
    objects.append(hero_b.to_object("Shelf_Hero_Spine", [hero]))
    glow_b = MeshBuilder()
    glow_b.add_grid_box("Hero_Glow", hero_x + 9, hero_x + hero_w - 9, 40 - 0.6, 40.0, hero_z + 28, hero_z + hero_h - 28, region, 0)
    gl = glow_b.to_object("Shelf_Hero_Glow", [glow])
    gl["breathing"] = "0.00 W emissive strip; animate emissiveIntensity in the web scene"
    objects.append(gl)

    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "shelf.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(MODELS / "shelf.glb"),
        export_format="GLB", use_selection=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_extras=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_yup=True,
    )
    print("SHELF_OBJECTS", [o.name for o in objects])
    print("SHELF_TRIS", sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects))


if __name__ == "__main__":
    import os

    if os.environ.get("BOOKLN_ONLY") == "shelf":
        build_shelf()
        raise SystemExit
    build_book()
    build_slipcase()
    build_desk_and_pedestal()
    build_shelf()
