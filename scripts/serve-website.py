from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit, urlunsplit


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBSITE_ROOT = PROJECT_ROOT / "website"
LIVE_API_URL = "https://cubisshop.ro/shop-api/api-v2.php"
DEMO_FIXTURE_PATH = PROJECT_ROOT / "scripts" / "fixtures" / "cubis-storefront-demo.json"
DEMO_FIXTURES_ENABLED = False

mimetypes.add_type("application/javascript", ".mjs")


class CleanUrlHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEBSITE_ROOT), **kwargs)

    def end_headers(self):
        # În dezvoltarea locală vrem întotdeauna ultima versiune a stilurilor și
        # scripturilor; altfel browserul poate păstra mult timp interfața veche.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _is_shop_api_request(self) -> bool:
        return urlsplit(self.path).path == "/shop-api/api-v2.php"

    def _serve_demo_fixture(self) -> None:
        if not DEMO_FIXTURES_ENABLED or not DEMO_FIXTURE_PATH.is_file():
            self.send_error(404)
            return
        payload = DEMO_FIXTURE_PATH.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Cubis-Preview-Only", "demo-fixtures")
        self.end_headers()
        self.wfile.write(payload)

    def _serve_demo_product_image(self) -> None:
        if not DEMO_FIXTURES_ENABLED:
            self.send_error(404)
            return
        parsed = urlsplit(self.path)
        query = parse_qs(parsed.query)
        kind = str(query.get("kind", ["package"])[0]).lower()
        try:
            variant = max(1, min(8, int(query.get("variant", ["1"])[0])))
        except ValueError:
            variant = 1
        palettes = [
            ("#e9f7ff", "#087ff5", "#052654"),
            ("#f2f4f8", "#26364c", "#0b1729"),
            ("#fff3e7", "#ff8515", "#63300b"),
            ("#eafbf5", "#00aa73", "#064d3b"),
            ("#f4efff", "#7446e8", "#2b1761"),
            ("#eef6ff", "#1975d2", "#0b3769"),
            ("#fff0f2", "#e84a67", "#6f1730"),
            ("#effcfb", "#16a6a2", "#075956"),
        ]
        background, accent, dark = palettes[(variant - 1) % len(palettes)]
        shapes = {
            "tire": '<ellipse cx="310" cy="215" rx="142" ry="176" fill="url(#rubber)"/><ellipse cx="310" cy="215" rx="76" ry="105" fill="url(#bg)" stroke="#fff" stroke-width="11"/><path d="M220 74l36 31m-67 36l45 22m-57 65l50 5m-33 69l47-14m6 70l38-29m115-242l-38 30m69 34l-45 23m56 63l-50 6m31 68l-47-13m-4 70l-39-28" stroke="#5d6a79" stroke-width="13" stroke-linecap="round" opacity=".72"/>',
            "brakes": '<g filter="url(#shadow)"><path d="M145 122h124l25 50v150H126V171z" fill="url(#metal)"/><path d="M351 122h124l19 49v151H326V171z" fill="url(#metal)"/><path d="M161 183h112v112H146V195zM367 183h112v112H352V195z" fill="#a5764d"/><circle cx="210" cy="155" r="17" fill="#172233"/><circle cx="416" cy="155" r="17" fill="#172233"/></g>',
            "disc": '<circle cx="310" cy="215" r="166" fill="url(#metal)"/><circle cx="310" cy="215" r="102" fill="url(#bg)"/><circle cx="310" cy="215" r="45" fill="url(#metal)"/><g fill="url(#bg)"><circle cx="310" cy="78" r="13"/><circle cx="310" cy="352" r="13"/><circle cx="173" cy="215" r="13"/><circle cx="447" cy="215" r="13"/><circle cx="213" cy="118" r="13"/><circle cx="407" cy="312" r="13"/><circle cx="407" cy="118" r="13"/><circle cx="213" cy="312" r="13"/></g>',
            "controller": '<g filter="url(#shadow)"><rect x="150" y="125" width="310" height="178" rx="18" fill="url(#metal)"/><path d="M118 139c-57 8-60 65-91 79M469 164c73-7 78-64 127-74" fill="none" stroke="#252f3c" stroke-width="12"/><path d="M118 139c-57 8-60 65-91 79" fill="none" stroke="#2bd851" stroke-width="5"/><circle cx="205" cy="213" r="25" fill="url(#bg)"/><rect x="265" y="184" width="143" height="58" rx="8" fill="#111c2d"/></g>',
            "camera": '<g filter="url(#shadow)"><rect x="160" y="91" width="293" height="247" rx="38" fill="url(#metal)"/><circle cx="320" cy="204" r="88" fill="#0a1628"/><circle cx="320" cy="204" r="61" fill="url(#lens)"/><circle cx="320" cy="204" r="25" fill="#07111f"/><rect x="190" y="116" width="65" height="19" rx="9" fill="url(#bg)"/></g>',
            "battery": '<g filter="url(#shadow)"><rect x="182" y="104" width="256" height="234" rx="22" fill="url(#metal)"/><rect x="220" y="75" width="180" height="47" rx="10" fill="#1a2638"/><path d="M214 173h192M214 204h192M214 235h192" stroke="#53657b" stroke-width="8"/><rect x="250" y="275" width="120" height="34" rx="8" fill="url(#accent)"/></g>',
            "charger": '<g filter="url(#shadow)"><rect x="137" y="119" width="238" height="212" rx="25" fill="url(#metal)"/><rect x="175" y="151" width="76" height="111" rx="10" fill="#111d30"/><rect x="270" y="151" width="76" height="111" rx="10" fill="#111d30"/><rect x="395" y="173" width="76" height="129" rx="15" fill="url(#metal)"/><path d="M415 150v-38m32 38v-38" stroke="#16243a" stroke-width="12"/></g>',
            "strap": '<path d="M256 41h108l26 123-24 224H254l-24-224z" fill="url(#accent)" filter="url(#shadow)"/><rect x="279" y="164" width="62" height="112" rx="12" fill="url(#bg)"/><circle cx="310" cy="310" r="10" fill="url(#bg)"/><circle cx="310" cy="342" r="10" fill="url(#bg)"/>',
            "cable": '<path d="M108 119c110 0 97 207 214 207s93-184 202-184" fill="none" stroke="#1b2739" stroke-width="24" stroke-linecap="round"/><g fill="url(#metal)" filter="url(#shadow)"><rect x="61" y="91" width="92" height="57" rx="13"/><rect x="485" y="113" width="79" height="58" rx="13"/></g><path d="M80 107v25m466-3v27" stroke="url(#accent)" stroke-width="11"/>',
            "hub": '<g filter="url(#shadow)"><rect x="103" y="141" width="387" height="154" rx="27" fill="url(#metal)"/><rect x="151" y="180" width="70" height="34" rx="5" fill="#071525"/><rect x="242" y="180" width="70" height="34" rx="5" fill="#071525"/><rect x="333" y="180" width="70" height="34" rx="5" fill="#071525"/><path d="M490 216h88" stroke="#1e2b3e" stroke-width="22" stroke-linecap="round"/><rect x="552" y="192" width="48" height="48" rx="8" fill="url(#metal)"/></g>',
            "mount": '<g fill="url(#metal)" filter="url(#shadow)"><circle cx="220" cy="212" r="74"/><rect x="270" y="166" width="170" height="92" rx="20"/><rect x="170" y="276" width="286" height="54" rx="18"/></g><circle cx="220" cy="212" r="35" fill="url(#bg)"/><path d="M322 146v-58m60 58V88" stroke="#1a2738" stroke-width="18" stroke-linecap="round"/>',
            "pump": '<g filter="url(#shadow)"><rect x="247" y="88" width="68" height="244" rx="18" fill="url(#metal)"/><rect x="205" y="63" width="153" height="35" rx="14" fill="#1a2738"/><rect x="210" y="326" width="145" height="34" rx="15" fill="#1a2738"/><path d="M315 308c105 9 72 82 155 62" fill="none" stroke="#1a2738" stroke-width="13"/></g>',
            "case": '<g filter="url(#shadow)"><rect x="144" y="92" width="333" height="252" rx="45" fill="url(#metal)"/><rect x="186" y="127" width="249" height="181" rx="28" fill="url(#bg)"/><circle cx="310" cy="217" r="68" fill="url(#lens)"/></g>',
            "adapter": '<g filter="url(#shadow)"><rect x="153" y="127" width="270" height="181" rx="26" fill="url(#metal)"/><rect x="203" y="169" width="86" height="48" rx="8" fill="#091729"/><rect x="315" y="169" width="57" height="48" rx="8" fill="#091729"/><path d="M423 221h102" stroke="#1a2738" stroke-width="22" stroke-linecap="round"/><rect x="498" y="191" width="70" height="60" rx="10" fill="url(#metal)"/></g>',
            "package": '<path d="M310 68l174 92v139l-174 91-174-91V160z" fill="url(#metal)" filter="url(#shadow)"/><path d="M136 160l174 92 174-92M310 252v138" fill="none" stroke="url(#bg)" stroke-width="13"/>'
        }
        shape = shapes.get(kind, shapes["package"])
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="620" height="430" viewBox="0 0 620 430" role="img" aria-label="Imagine produs demonstrativ">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{background}"/><stop offset="1" stop-color="#fff"/></linearGradient><linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{accent}"/><stop offset="1" stop-color="{dark}"/></linearGradient><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5c6b7e"/><stop offset=".45" stop-color="#1b293b"/><stop offset="1" stop-color="#0b1524"/></linearGradient><linearGradient id="rubber"><stop stop-color="#101722"/><stop offset=".55" stop-color="#303b49"/><stop offset="1" stop-color="#070b12"/></linearGradient><radialGradient id="lens"><stop stop-color="#18d5ff"/><stop offset=".45" stop-color="#1163c8"/><stop offset="1" stop-color="#05152d"/></radialGradient><filter id="shadow"><feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#052654" flood-opacity=".22"/></filter></defs>
<rect width="620" height="430" rx="28" fill="none"/><circle cx="525" cy="76" r="92" fill="{accent}" opacity=".08"/><circle cx="92" cy="352" r="116" fill="{accent}" opacity=".06"/>{shape}<g transform="translate(465 374)"><rect width="128" height="31" rx="15" fill="#fff" opacity=".92"/><text x="64" y="20" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="{dark}">PREVIEW DEMO</text></g></svg>'''
        payload = svg.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Cubis-Preview-Only", "demo-image")
        self.end_headers()
        self.wfile.write(payload)

    def _proxy_shop_api(self) -> None:
        parsed = urlsplit(self.path)
        upstream_url = urlunsplit(("https", "cubisshop.ro", "/shop-api/api-v2.php", parsed.query, ""))
        content_length = int(self.headers.get("Content-Length", "0") or 0)
        request_body = self.rfile.read(content_length) if content_length else None
        forwarded_headers = {
            "Accept": self.headers.get("Accept", "application/json"),
            "User-Agent": "CubisShop-LocalPreview/1.0",
        }
        for header_name in ("Content-Type", "X-Customer-Token", "X-Shop-Device"):
            if self.headers.get(header_name):
                forwarded_headers[header_name] = self.headers[header_name]
        request = urllib.request.Request(
            upstream_url,
            data=request_body,
            headers=forwarded_headers,
            method=self.command,
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = response.read()
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json; charset=utf-8"))
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as failure:
            payload = failure.read()
            self.send_response(failure.code)
            self.send_header("Content-Type", failure.headers.get("Content-Type", "application/json; charset=utf-8"))
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except (urllib.error.URLError, TimeoutError) as failure:
            payload = ('{"error":"API-ul live nu este disponibil în preview: %s"}' % str(failure.reason if hasattr(failure, "reason") else failure)).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    def do_GET(self):
        request_path = urlsplit(self.path).path
        if request_path == "/__preview__/cubis-demo.json":
            self._serve_demo_fixture()
            return
        if request_path == "/__preview__/cubis-product.svg":
            self._serve_demo_product_image()
            return
        if self._is_shop_api_request():
            self._proxy_shop_api()
            return
        super().do_GET()

    def do_POST(self):
        if self._is_shop_api_request():
            self._proxy_shop_api()
            return
        self.send_error(404)

    def _send_cubis_404(self):
        error_page = WEBSITE_ROOT / "404.html"
        try:
            response = error_page.open("rb")
        except OSError:
            self.send_error(404)
            return None
        file_size = error_page.stat().st_size
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(file_size))
        self.end_headers()
        return response

    def send_head(self):
        parsed = urlsplit(self.path)
        request_path = unquote(parsed.path)

        if request_path.rstrip("/").startswith("/magazin/produs/"):
            relative_product_path = request_path.removeprefix("/magazin/produs/").strip("/")
            if (
                not relative_product_path
                or "/" in relative_product_path
                or "\\" in relative_product_path
                or relative_product_path in {".", ".."}
            ):
                return self._send_cubis_404()
            self.path = urlunsplit((parsed.scheme, parsed.netloc, "/produs.html", parsed.query, parsed.fragment))
            return super().send_head()

        if request_path != "/" and not Path(request_path).suffix:
            html_candidate = WEBSITE_ROOT / f"{request_path.lstrip('/')}.html"
            if html_candidate.is_file():
                self.path = urlunsplit((parsed.scheme, parsed.netloc, f"{parsed.path}.html", parsed.query, parsed.fragment))
                return super().send_head()

        local_candidate = WEBSITE_ROOT / request_path.lstrip("/")
        if request_path != "/" and Path(request_path).suffix in {"", ".html"} and not local_candidate.exists():
            return self._send_cubis_404()

        return super().send_head()


def main() -> None:
    parser = argparse.ArgumentParser(description="Servește previewul local Cubis Shop.")
    parser.add_argument("port", nargs="?", type=int, default=4173)
    parser.add_argument("--demo-fixtures", action="store_true", help="expune fixture-urile locale numai pentru validare vizuală")
    args = parser.parse_args()
    global DEMO_FIXTURES_ENABLED
    DEMO_FIXTURES_ENABLED = bool(args.demo_fixtures)
    server = ThreadingHTTPServer(("localhost", args.port), CleanUrlHandler)
    mode = " cu fixture-uri DEMO" if DEMO_FIXTURES_ENABLED else ""
    print(f"Cubis Shop website available at http://localhost:{args.port}{mode}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
