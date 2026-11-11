"""Close-up preview render of a baked weapon GLB: python3 blender/weapon_show.py <name> <out.jpg>"""
import bpy, math, os, sys
from mathutils import Vector
name, out = sys.argv[1], sys.argv[2]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'assets'))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, name + '.glb'))
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
# the game model is Y-up after import -> length along +Z in Blender; lay it flat, slightly raised
for o in objs:
    o.rotation_mode = 'XYZ'; o.rotation_euler = (math.radians(90), math.radians(0), math.radians(100)); o.location = (0, 0.9, 0.09)
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
g = bpy.context.active_object; gm = bpy.data.materials.new('floor'); gm.use_nodes = True
b = gm.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.035, 0.03, 0.028, 1); b.inputs['Roughness'].default_value = 0.75
g.data.materials.append(gm)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
env = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(os.path.join(ROOT, 'sky.jpg'))
w.node_tree.links.new(env.outputs[0], w.node_tree.nodes['Background'].inputs['Color']); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.25
for nm, loc, rot, energy, col, size in (
        ('key', (-0.8, -1.6, 2.0), (math.radians(38), 0, math.radians(-25)), 420, (1.0, 0.84, 0.7), 1.8),
        ('rim', (1.6, 1.4, 0.8), (math.radians(-68), 0, math.radians(135)), 380, (1.0, 0.5, 0.3), 0.9),
        ('top', (0.2, 0.2, 2.6), (0, 0, 0), 200, (0.85, 0.88, 1.0), 2.8)):
    L = bpy.data.lights.new(nm, 'AREA'); L.energy = energy; L.color = col; L.size = size
    o = bpy.data.objects.new(nm, L); sc.collection.objects.link(o); o.location = loc; o.rotation_euler = rot
cam = bpy.data.cameras.new('cam'); cam.lens = 38
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
co.location = (float(os.environ.get('CX', 0.9)), -2.3, 1.9)
tgt = Vector((float(os.environ.get('TX', 0.75)), 0.55, 0.0))
co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler()
sc.cycles.samples = int(os.environ.get('SAMPLES', 96)); sc.cycles.use_denoising = True
sc.render.resolution_x = 1600; sc.render.resolution_y = 900
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - High Contrast'; sc.view_settings.exposure = -0.3
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
