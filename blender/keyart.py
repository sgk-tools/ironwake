"""Title key art rendered with Cycles from the exported game assets (same rig + pose math as the game)."""
import bpy, json, math, os, random, sys
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(__file__))
from lib import reset, OUT

PIVOT = 0.55
JOINTS = ['pelvis', 'torso', 'head', 'cloak', 'uarmR', 'uarmL', 'farmR', 'farmL', 'handR', 'handL',
          'thighR', 'thighL', 'shinR', 'shinL', 'footR', 'footL']
ORDER = {'uarmR': 'YZX', 'uarmL': 'YZX', 'torso': 'YXZ', 'pelvis': 'YXZ', 'handR': 'YZX', 'handL': 'YZX'}
SKEL = json.load(open(os.path.join(OUT, 'skeleton.json')))
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # three.js -> Blender axes
CI = C.inverted()


def T(x, y, z): return Matrix.Translation((x, y, z))
def R(order, x, y, z):
    m = Matrix.Identity(4)
    rot = {'X': Matrix.Rotation(x, 4, 'X'), 'Y': Matrix.Rotation(y, 4, 'Y'), 'Z': Matrix.Rotation(z, 4, 'Z')}
    for ch in order:
        m = m @ rot[ch]
    return m


def imp(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + '.glb'))
    parts = {}
    for o in [o for o in bpy.data.objects if o not in before]:
        if o.type != 'MESH':
            continue
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        o.hide_render = True; o.hide_set(True)
        parts[o.name.split('.')[0]] = o
    return parts


def inst(src, mw):
    o = src.copy(); bpy.context.collection.objects.link(o)
    o.hide_render = False; o.hide_set(False)
    o.matrix_world = C @ mw @ CI
    return o


def place(parts, pose, pos, face, scale=1.0, weapon=None):
    root = T(*pos) @ R('Y', 0, face, 0) @ Matrix.Diagonal((scale, scale, scale, 1))
    inner = T(0, PIVOT + pose.get('rootY', 0), 0) @ R('YXZ', pose.get('rootPitch', 0), pose.get('rootYaw', 0), 0)
    W = {}
    for n in JOINTS:
        if n not in SKEL:
            continue
        base = n.rstrip('RL') if n not in ('pelvis',) else n
        base = n[:-1] if n[-1] in 'RL' else n
        if base not in parts:
            continue
        par, off = SKEL[n]
        ox, oy, oz = off
        if par is None:
            oy -= PIVOT
        local = T(ox, oy, oz) @ R(ORDER.get(n, 'XYZ'), *pose.get(n, (0, 0, 0)))
        W[n] = (root @ inner if par is None else W[par]) @ local
        inst(parts[base], W[n])
    if weapon is not None:
        inst(weapon, W['handR'] @ T(0, -0.085, 0) @ R('X', math.pi / 2, 0, 0))


def walk(phase, k=1.0):
    s, c = math.sin(phase), math.cos(phase)
    return {
        'torso': (0.4, 0.15 * s, 0), 'head': (0.2, -0.1 * s, 0.15),
        'uarmR': (-0.3 + 0.2 * s, 0, -0.2), 'farmR': (-0.6, 0, 0), 'handR': (0.85, 0, 0),
        'uarmL': (0.6 * s, 0, 0.15), 'farmL': (-0.4, 0, 0),
        'thighR': (-0.75 * s * k - 0.1, 0, 0), 'thighL': (0.75 * s * k - 0.1, 0, 0),
        'shinR': (0.3 + 0.8 * max(0, -c), 0, 0), 'shinL': (0.3 + 0.8 * max(0, c), 0, 0),
        'rootY': -0.04 + 0.05 * abs(c),
    }


def build():
    reset()
    sc = bpy.context.scene
    hero, grunt, boss = imp('hero'), imp('grunt'), imp('boss')
    sword = imp('sword')['sword']
    weap = imp('weapons')
    props = imp('props')

    # hero: striding toward camera, dragging the greatsword whose tip scrapes the ground behind
    hero_pose = {
        'pelvis': (0, -0.15, 0), 'torso': (0.18, 0.2, 0), 'head': (0.12, -0.15, 0),
        'uarmR': (0.32, 0.1, -0.32), 'farmR': (-0.25, 0, 0), 'handR': (2.55, 0, 0),
        'uarmL': (-0.35, 0, 0.22), 'farmL': (-0.55, 0, 0),
        'thighR': (0.35, 0, -0.05), 'shinR': (0.4, 0, 0), 'footR': (0.2, 0, 0),
        'thighL': (-0.55, 0, 0.05), 'shinL': (0.25, 0, 0), 'footL': (0.1, 0, 0),
        'cloak': (0.45, 0, -0.1), 'rootY': -0.04,
    }
    place(hero, hero_pose, (0, 0, 0), -0.35, 1.0, sword)

    random.seed(4)
    for i in range(34):
        x = random.uniform(-14, 14); z = -random.uniform(5, 26)
        if abs(x) < 2.0 and z > -8:
            continue
        brute = random.random() < 0.18
        place(grunt, walk(random.uniform(0, 6.28)), (x, 0, z), math.atan2(-x, -z) + random.uniform(-0.4, 0.4),
              1.38 if brute else 0.97, weap['club'] if brute else weap['gsword'])
    roar = {'torso': (-0.5, 0, 0), 'head': (-0.6, 0, 0), 'uarmR': (-0.3, 0, -1.2), 'uarmL': (-0.3, 0, 1.2),
            'farmR': (-0.6, 0, 0), 'farmL': (-0.6, 0, 0), 'thighR': (0.2, 0, -0.12), 'thighL': (-0.35, 0, 0.12),
            'shinR': (0.3, 0, 0), 'shinL': (0.35, 0, 0)}
    place(boss, roar, (-5.5, 0, -24), 0.25, 2.3, weap['bossaxe'])

    # props
    def prop(name, x, z, s=1.0, ry=0.0, rx=0.0, rz=0.0, y=0.0):
        inst(props[name], T(x, y, z) @ R('XYZ', rx, ry, rz) @ Matrix.Diagonal((s, s, s, 1)))
    for i in range(26):
        prop('spear', random.uniform(-12, 12), -random.uniform(1, 22), 1, random.uniform(0, 6), random.uniform(-.5, .5), random.uniform(-.5, .5), -0.3)
    prop('banner', 4.2, -6, 1, 0.6, 0, 0.12, -0.2); prop('banner', -7, -14, 1, 2.0, 0, -0.1, -0.2)
    prop('rock3', 7.5, -4, 1.4, 1.0); prop('rock1', -6, -2.5, 1.0, 2.0); prop('rock2', 2.6, 1.2, 0.6, 0.4)
    prop('rock3', -14, -20, 2.4, 0.2); prop('tree4', 10, -16, 1.2, 0.8); prop('tree9', -11, -9, 1.1, 2.4)
    prop('pillar', 6, -13, 1.1, 0.3, 0, 0.08)

    # ground
    bpy.ops.mesh.primitive_plane_add(size=200)
    g = bpy.context.active_object
    m = bpy.data.materials.new('ground'); m.use_nodes = True; nt = m.node_tree
    bs = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (200 / 6, 200 / 6, 1)
    nt.links.new(tc.outputs['UV'], mp.inputs[0])
    def timg(fn, noncolor):
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(os.path.join(OUT, fn))
        if noncolor: n.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(mp.outputs[0], n.inputs[0]); return n
    nt.links.new(timg('ground_col.jpg', False).outputs[0], bs.inputs['Base Color'])
    nt.links.new(timg('ground_rough.jpg', True).outputs[0], bs.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.5
    nt.links.new(timg('ground_nrm.jpg', True).outputs[0], nm.inputs['Color']); nt.links.new(nm.outputs[0], bs.inputs['Normal'])
    g.data.materials.append(m)

    # world: rendered sky panorama, rotated so the low red sun sits behind the horde
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; wt = w.node_tree
    bg = wt.nodes['Background']; env = wt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(OUT, 'sky.jpg'))
    wtc = wt.nodes.new('ShaderNodeTexCoord'); wmp = wt.nodes.new('ShaderNodeMapping')
    wmp.inputs['Rotation'].default_value = (0, 0, math.radians(90) + 0.25)
    wt.links.new(wtc.outputs['Generated'], wmp.inputs[0]); wt.links.new(wmp.outputs[0], env.inputs[0])
    wt.links.new(env.outputs[0], bg.inputs['Color']); bg.inputs['Strength'].default_value = float(os.environ.get('ENV', 0.7))

    # atmosphere: a box of thin participating media
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -12, 6)); vol = bpy.context.active_object
    vol.scale = (70, 70, 12)
    vm = bpy.data.materials.new('haze'); vm.use_nodes = True; vt = vm.node_tree; vt.nodes.clear()
    vo = vt.nodes.new('ShaderNodeOutputMaterial'); pv = vt.nodes.new('ShaderNodeVolumePrincipled')
    pv.inputs['Density'].default_value = float(os.environ.get('HAZE', 0.0022)); pv.inputs['Color'].default_value = (0.75, 0.6, 0.55, 1)
    pv.inputs['Anisotropy'].default_value = 0.6
    vt.links.new(pv.outputs[0], vo.inputs['Volume']); vol.data.materials.append(vm)

    # lights: backlight sun (red), cool fill, warm key on the hero
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 1.2; sun.color = (1.0, 0.42, 0.22); sun.angle = math.radians(3)
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(78), 0, math.radians(180 + 15))
    key = bpy.data.lights.new('key', 'AREA'); key.energy = 1100; key.size = 3; key.color = (1.0, 0.72, 0.55)
    ko = bpy.data.objects.new('key', key); sc.collection.objects.link(ko)
    ko.location = (-4.5, -4.0, 3.8); ko.rotation_euler = (math.radians(55), 0, math.radians(-48))
    rim = bpy.data.lights.new('rim', 'AREA'); rim.energy = 2200; rim.size = 2; rim.color = (1.0, 0.35, 0.18)
    ro = bpy.data.objects.new('rim', rim); sc.collection.objects.link(ro)
    ro.location = (2.5, 4.5, 3.2); ro.rotation_euler = (math.radians(-60), 0, math.radians(150))
    fill = bpy.data.lights.new('fill', 'AREA'); fill.energy = 220; fill.size = 5; fill.color = (0.55, 0.62, 1.0)
    fo = bpy.data.objects.new('fill', fill); sc.collection.objects.link(fo)
    fo.location = (5, -5, 2); fo.rotation_euler = (math.radians(70), 0, math.radians(45))

    # camera: low, slightly off-centre, hero on the left third
    cam = bpy.data.cameras.new('cam'); cam.lens = 28; cam.dof.use_dof = True
    cam.dof.aperture_fstop = 2.8
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    co.location = C @ Vector(tuple(float(v) for v in os.environ.get('CAM', '-2.6,0.85,3.9').split(',')))
    target = C @ Vector((-1.1, 1.45, -0.75))
    co.rotation_euler = (target - co.location).to_track_quat('-Z', 'Y').to_euler()
    focus = bpy.data.objects.new('focus', None); sc.collection.objects.link(focus); focus.location = C @ Vector((0, 1.2, 0))
    cam.dof.focus_object = focus

    sc.cycles.samples = int(os.environ.get('SAMPLES', 64))
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4; sc.cycles.volume_bounces = 1
    sc.render.resolution_x = int(os.environ.get('W', 1600)); sc.render.resolution_y = int(os.environ.get('H', 900))
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - High Contrast'
    sc.view_settings.exposure = float(os.environ.get('EXPO', -0.35))
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 86
    sc.render.filepath = os.environ.get('OUTFILE', os.path.join(OUT, 'title.jpg'))
    bpy.ops.render.render(write_still=True)
    print('keyart done', sc.render.filepath)


if __name__ == '__main__':
    build()
