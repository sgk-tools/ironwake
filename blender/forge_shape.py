"""'炉心の大剣' second draft - SHAPE REVIEW ONLY (clay material).

Original IRONWAKE design that satisfies: symmetric double edge, tip on the centre line, blade longer than
the character is tall, thick core visible from the side.
Distinguishing choices: narrow unsharpened ricasso -> pair of forked parrying lugs -> blade swells, then a
long continuous taper to the point (not a parallel slab); lozenge cross-section with a raised mid-ridge;
round vented 'forge core' collar with a short bar; octagonal ingot pommel.
Outputs renders/shape_*.png (same orthographic scale) and prints measured dimensions."""
import bpy, bmesh, math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix
from lib import reset, cyl, cube, sphere, torus, join, apply_all, tris, pbr, OUT
from lib import _select

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BLADE_L = 2.05          # guard top -> point
RICASSO = 0.2
W_RIC = 0.105           # half width of the ricasso
W_MAX = 0.175           # half width at the swell
Z_MAX = 0.55            # where the swell peaks
Z_TAPER = 1.45          # where the point starts to narrow
T_MAX = 0.038           # half thickness at the ridge (7.6 cm core)


def half_width(z):
    if z <= RICASSO:
        return W_RIC
    if z <= Z_MAX:
        u = (z - RICASSO) / (Z_MAX - RICASSO)
        return W_RIC + (W_MAX - W_RIC) * math.sin(u * math.pi / 2)
    if z <= Z_TAPER:                               # gently bellied body, edges never parallel
        u = (z - Z_MAX) / (Z_TAPER - Z_MAX)
        return W_MAX * (1 - 0.1 * u * u)
    u = (z - Z_TAPER) / (BLADE_L - Z_TAPER)        # long ogival point over the last third
    return W_MAX * 0.9 * math.cos(u * math.pi / 2) ** 0.85


def half_thick(z):
    u = z / BLADE_L
    return T_MAX * (1 - 0.45 * u) if u < 0.97 else T_MAX * 0.55 * (1 - (u - 0.97) / 0.03) + 0.002


def blade(mat_core, mat_flat):
    """Loft of a 12-point lozenge section: edge flat, bevel, ridge flat - mirrored left/right and front/back."""
    N = 90
    me = bpy.data.meshes.new('blade'); o = bpy.data.objects.new('blade', me); bpy.context.collection.objects.link(o)
    bm = bmesh.new(); rings = []
    for i in range(N + 1):
        z = BLADE_L * (i / N) ** 0.92
        w = max(half_width(z), 0.0008); t = max(half_thick(z), 0.0008)
        e = min(0.0035, t * 0.4)
        b = 0.42 * w; r = 0.07 * w          # bevel shoulder, ridge half-width
        sec = [(w, e), (b, 0.82 * t), (r, t), (-r, t), (-b, 0.82 * t), (-w, e),
               (-w, -e), (-b, -0.82 * t), (-r, -t), (r, -t), (b, -0.82 * t), (w, -e)]
        rings.append([bm.verts.new((x, y, z)) for x, y in sec])
    # material per strip: 0..11 -> ridge strips use core material, bevels the flat one
    strip_mat = [1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1]
    for i in range(N):
        a, c = rings[i], rings[i + 1]
        for j in range(12):
            j2 = (j + 1) % 12
            f = bm.faces.new((a[j], a[j2], c[j2], c[j])); f.material_index = strip_mat[j]
    bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o.data.materials.append(mat_core); o.data.materials.append(mat_flat)
    _select([o]); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(25))
    return o


def lugs(mat):
    """Forked parrying lugs at the end of the ricasso, mirrored."""
    parts = []
    for s in (-1, 1):
        for k, (dz, ang, ln) in enumerate(((0.0, 55, 0.075), (0.045, 25, 0.06))):
            x0 = s * (W_RIC + 0.005)
            c = cube((ln, 0.034, 0.024), (x0 + s * ln * 0.45 * math.cos(math.radians(ang)), 0, RICASSO + dz + ln * 0.45 * math.sin(math.radians(ang))),
                     mat, rot=(0, -s * math.radians(ang), 0), bevel=0.006)
            parts.append(c)
    return parts


def hilt(mat):
    p = [cyl(0.125, 0.125, 0.085, (0, 0, -0.04), mat, verts=40, bevel=0.008),       # forge-core collar
         torus(0.127, 0.009, (0, 0, 0.004), mat), torus(0.127, 0.009, (0, 0, -0.084), mat)]
    for k in range(10):
        a = k / 10 * 2 * math.pi
        p.append(cube((0.016, 0.03, 0.06), (math.cos(a) * 0.126, math.sin(a) * 0.126, -0.04), mat, rot=(0, 0, a), bevel=0.0, smooth=False))
    for s in (-1, 1):                                                                 # short bar with octagonal ends
        p.append(cube((0.11, 0.05, 0.045), (s * 0.18, 0, -0.04), mat, bevel=0.008))
        p.append(cyl(0.03, 0.03, 0.06, (s * 0.25, 0, -0.04), mat, verts=8, rot=(0, math.radians(90), 0), bevel=0.004, smooth=False))
    p.append(cyl(0.029, 0.027, 0.56, (0, 0, -0.37), mat, verts=24))                  # wrapped grip (shape only)
    p.append(cyl(0.036, 0.05, 0.08, (0, 0, -0.69), mat, verts=8, bevel=0.006, smooth=False))  # octagonal ingot pommel
    p.append(cyl(0.05, 0.043, 0.022, (0, 0, -0.74), mat, verts=8, bevel=0.004, smooth=False))
    return p


def measure(o):
    xs = [v.co.x for v in o.data.vertices]; ys = [v.co.y for v in o.data.vertices]; zs = [v.co.z for v in o.data.vertices]
    return max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)


if __name__ == '__main__':
    reset()
    clay_a = pbr('clay_core', (0.16, 0.16, 0.16), r1=0.55, bstr=0.0)
    clay_b = pbr('clay_flat', (0.3, 0.3, 0.29), r1=0.5, bstr=0.0)
    bl = blade(clay_a, clay_b)
    bw, bt, bl_len = measure(bl)
    grip_len = 0.56 - 0.0   # visible grip between collar and pommel
    parts = [bl] + lugs(clay_a) + hilt(clay_a)
    sw = join(parts, 'sword_forge')
    W, T, L = measure(sw)
    sw.location.z = -min(v.co.z for v in sw.data.vertices)
    print(f'MEASURE blade_length={bl_len:.3f} blade_max_width={bw:.3f} blade_max_thickness={bt:.3f} '
          f'grip_visible={grip_len:.3f} overall_length={L:.3f} overall_width={W:.3f} tris={tris(sw)}')
    print(f'RATIO blade/grip={bl_len / grip_len:.2f} width/length={bw / bl_len:.3f} thick/width={bt / bw:.3f}')

    sc = bpy.context.scene
    # centre line for the front view
    bpy.ops.mesh.primitive_cylinder_add(radius=0.003, depth=3.2, location=(0, -0.2, 1.45))
    cl = bpy.context.active_object
    cl.data.materials.append(pbr('cl', (1, 0.1, 0.05), r1=1, bstr=0.0, emit=((1, 0.1, 0.05), 3)))
    # character lineup: import the game hero and assemble its rest pose beside the sword
    import keyart
    hero = keyart.imp('hero')
    keyart.place(hero, {}, (-0.85, 0, 0), 0.0)
    bpy.ops.mesh.primitive_plane_add(size=20); gp = bpy.context.active_object; gp.data.materials.append(pbr('gp', (0.1, 0.1, 0.1), r1=0.9, bstr=0.0))
    # neutral backdrop and lights
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.16, 0.16, 0.17, 1)
    for name, loc, e in (('key', (-3, -4, 4), 300), ('fill', (4, -3, 2), 110), ('back', (0, 4, 3), 120)):
        L_ = bpy.data.lights.new(name, 'AREA'); L_.energy = e; L_.size = 4
        lo = bpy.data.objects.new(name, L_); sc.collection.objects.link(lo); lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0.8)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = 3.3
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    os.makedirs(os.path.join(ROOT, 'renders'), exist_ok=True)
    centre = Vector((0, 0, 1.42))
    hero_objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.name not in ('sword_forge', 'Plane') and not o.hide_render and o is not cl and o is not gp]
    views = [('front', Vector((0, -6, 0)), True, False), ('side', Vector((6, 0, 0)), False, False),
             ('oblique', Vector((4.2, -4.2, 0.6)), False, False), ('lineup', Vector((0, -6, 0)), False, True)]
    for name, off, show_cl, show_hero in views:
        cl.hide_render = not show_cl
        for o in hero_objs: o.hide_render = not show_hero
        c = centre + Vector((-0.42, 0, 0.0)) if show_hero else centre
        co.location = c + off
        co.rotation_euler = (c - co.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.resolution_x, sc.render.resolution_y = (1100 if show_hero else 800), 1300
        cam.ortho_scale = 3.3 * (1100 / 1300 if show_hero else 1300 / 1300) if False else 3.3
        sc.render.filepath = os.path.join(ROOT, 'renders', f'shape_{name}.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', name)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'sword_forge_shape.blend'))
