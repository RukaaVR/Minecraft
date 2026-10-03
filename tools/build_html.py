#!/usr/bin/env python3
"""Build dist/WebCraft.html: the whole game in one small, offline HTML file.

The game's scripts (three.js included) are minified when esbuild is available,
gzipped and base64-encoded into the page; a tiny loader unpacks them with the
browser's DecompressionStream and runs them in index.html's order.

Usage: python3 tools/build_html.py [path/to/esbuild]
"""
import base64, gzip, json, os, re, shutil, subprocess, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
esbuild = sys.argv[1] if len(sys.argv) > 1 else shutil.which('esbuild')

html = open('index.html').read()
body = html.split('<body>', 1)[1].rsplit('</body>', 1)[0]
srcs = re.findall(r'<script src="([^"]+)"></script>', body)
body = re.sub(r'\s*<script src="[^"]+"></script>', '', body)

files = []
for src in srcs:
    code = open(src).read()
    if esbuild and not src.endswith('.min.js'):
        r = subprocess.run([esbuild, '--minify', '--loader=js', '--target=es2020'], input=code, capture_output=True, text=True)
        if r.returncode:
            sys.exit(f'esbuild failed on {src}:\n{r.stderr}')
        code = r.stdout
    files.append(code)
payload = base64.b64encode(gzip.compress(json.dumps(files).encode('utf-8'), 9)).decode()

loader = '''<script>
// The game's scripts are gzipped above to keep this file small; unpack and run them in order.
(async function () {
  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser is too old to unpack the game (it needs DecompressionStream).');
    const bin = atob(document.getElementById('webcraft-code').textContent.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    for (const src of JSON.parse(text)) {
      const s = document.createElement('script');
      s.textContent = src;
      document.body.appendChild(s);
    }
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;left:16px;right:16px;bottom:40px;color:#f88;font:16px monospace">Could not start WebCraft: ' + String(e.message || e).replace(/</g, '&lt;') + '</p>');
  }
})();
</script>'''

out = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>WebCraft</title>\n'
       '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap">\n'
       '<style>\n' + open('style.css').read() + '\n</style>\n</head>\n<body>\n' + body +
       '\n<script type="application/octet-stream" id="webcraft-code">' + payload + '</script>\n' + loader + '\n</body>\n</html>\n')
os.makedirs('dist', exist_ok=True)
open('dist/WebCraft.html', 'w').write(out)
print(f'dist/WebCraft.html: {len(out) // 1024} KB ({"minified" if esbuild else "not minified"})')
