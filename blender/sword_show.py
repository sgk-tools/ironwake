"""Full-length showcase render of the current (original) greatsword."""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector
import sword_real
from sword_real import build, scanned_mat
from lib import uv_atlas
sw = build()
sc = bpy.context.scene
sw.rotation_euler = (math.radians(90), 0, math.radians(90)); sw.location = (-1.1, 0, 0.026)
bpy.ops.mesh.primitive_plane_add(size=10)
g = bpy.context.active_object
g.data.materials.append(scanned_mat('floor', ('rusty_metal_04', 'rusty_metal_04', 0.5), mask_range=(0.9, 1.0), edge_polish=False, tint=(0.05, 0.045, 0.042), desat=True))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
wt = w.node_tree; env = wt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(os.path.join(os.path.dirname(__file__), '..', 'assets', 'sky.jpg'))
wt.links.new(env.outputs[0], wt.nodes['Background'].inputs['Color']); wt.nodes['Background'].inputs['Strength'].default_value = 0.35
for name, loc, rot, e, col, size in (('key', (0.0, -1.6, 2.2), (math.radians(35), 0, 0), 1400, (1, 0.82, 0.68), 3.0),
                                     ('rim', (0.2, 1.6, 1.0), (math.radians(-60), 0, math.radians(180)), 900, (1, 0.5, 0.3), 2.5),
                                     ('top', (0, 0, 3), (0, 0, 0), 500, (0.85, 0.88, 1), 4)):
    L = bpy.data.lights.new(name, 'AREA'); L.energy = e; L.color = col; L.size = size
    o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc; o.rotation_euler = rot
cam = bpy.data.cameras.new('cam'); cam.lens = 40
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
co.location = (0.0, -2.6, 2.1)
co.rotation_euler = (Vector((0.0, 0.05, 0.0)) - co.location).to_track_quat('-Z', 'Y').to_euler()
sc.cycles.samples = 96; sc.cycles.use_denoising = True
sc.render.resolution_x = 1600; sc.render.resolution_y = 900
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - High Contrast'; sc.view_settings.exposure = -0.3
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
sc.render.filepath = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'renders', 'sword_full.jpg'))
bpy.ops.render.render(write_still=True)
print('done', sc.render.filepath)
