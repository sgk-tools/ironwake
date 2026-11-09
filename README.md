# Ironwake（鉄塊の傭兵）

iPhone / ブラウザで遊べるオリジナルのダークファンタジー一騎当千アクション（three.js + WebGL）。

## 構成
- `src/` ゲーム本体（main.js / anim.js / input.js / audio.js / index.html）
- `blender/` Blender 5.2（bpy）用のモデル生成・テクスチャ焼き込み・レンダリングスクリプト
- `assets/` 焼き込み済みアセット（glb / jpg）
- `tools/` 自動テスト（Playwright）・ポーズ確認・GLB→JSON変換
- `build.sh` dist/ に公開用ファイルを生成

## ビルド
```
npm install
./build.sh
```

## アセット再生成
```
python3 -m venv bvenv && ./bvenv/bin/pip install bpy==5.2.3
```
スキャン素材（CC0, Poly Haven）を `cc0/<id>/{diff,nor,rough,metal,ao,disp}.jpg` に配置して実行する：
rusty_metal_02, rusty_metal_04, metal_plate_02, brown_leather, hessian_230（2K, https://polyhaven.com ）
```
cd blender
../bvenv/bin/python hero_real.py      # 主人公
../bvenv/bin/python sword_real.py all # 大剣
../bvenv/bin/python characters.py grunt boss
../bvenv/bin/python weapons.py
../bvenv/bin/python environment.py
../bvenv/bin/python keyart.py         # タイトル画像
```
