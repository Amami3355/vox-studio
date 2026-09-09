"""Exercise the real proxy with a >32 MiB response, ranges and authentication.

Run with Python and Docker available. Uses synthetic bytes only and removes its
own temporary container. The image pins the deployed nginx dependencies.
"""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

IMAGE = 'europe-west1-docker.pkg.dev/studio-prod-7f3a/vox-crew/studio-proxy@sha256:218782dce99f145af68529842a0bdcce4c0233e203b2d9671a5ccdd51475d6c6'
DATA = bytes(range(256)) * (160 * 1024) + b'complete-film'
ROUTE = '/api/jobs/test/media/' + hashlib.sha256(DATA).hexdigest()


class Upstream(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        pass

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if self.headers.get('Cookie') != 'test_session=authenticated':
            self.send_response(401)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        start, end, status = 0, len(DATA) - 1, 200
        requested = self.headers.get('Range')
        if requested:
            left, right = requested.removeprefix('bytes=').split('-')
            start = int(left) if left else len(DATA) - int(right)
            end = int(right) if left and right else end
            status = 206
        self.send_response(status)
        self.send_header('Content-Type', 'video/mp4')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'private, no-store')
        if requested:
            self.send_header('Content-Range', f'bytes {start}-{end}/{len(DATA)}')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(DATA[start:end + 1])


class ProxyStreaming(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = ThreadingHTTPServer(('0.0.0.0', 0), Upstream)
        threading.Thread(target=cls.upstream.serve_forever, daemon=True).start()
        cls.temp = tempfile.TemporaryDirectory(prefix='vox-proxy-stream-')
        config = Path(cls.temp.name) / 'nginx.conf'
        original = Path(__file__).with_name('nginx.conf').read_text()
        config.write_text(original.replace('10.132.0.3:8780', f'host.docker.internal:{cls.upstream.server_port}'))
        cls.container = subprocess.check_output(['docker', 'run', '--rm', '--detach',
            '--publish', '127.0.0.1::8080', '--mount', f'type=bind,src={config},dst=/etc/nginx/nginx.conf,readonly',
            IMAGE], text=True).strip()
        port = subprocess.check_output(['docker', 'port', cls.container, '8080'], text=True).strip().rsplit(':', 1)[1]
        cls.origin = 'http://127.0.0.1:' + port
        for attempt in range(40):
            try:
                urllib.request.urlopen(cls.origin, timeout=1)
            except urllib.error.HTTPError as error:
                error.close()
                break
            except (urllib.error.URLError, ConnectionError):
                time.sleep(.25)
            else:
                break

    @classmethod
    def tearDownClass(cls):
        subprocess.run(['docker', 'rm', '--force', cls.container], check=True, capture_output=True)
        cls.upstream.shutdown()
        cls.upstream.server_close()
        cls.temp.cleanup()

    def request(self, range_header=None, method='GET'):
        headers = {'Cookie': 'test_session=authenticated'}
        if range_header:
            headers['Range'] = range_header
        return urllib.request.urlopen(urllib.request.Request(self.origin + ROUTE, headers=headers, method=method), timeout=30)

    def test_full_and_open_ended_responses_stream_beyond_cloud_run_limit(self):
        for range_header, status in [(None, 200), ('bytes=0-', 206)]:
            with self.subTest(range=range_header):
                # Cloud Run must be able to speak h2c to the actual proxy. TLS is
                # terminated at Google's edge, not inside this container.
                script = '''const http2=require('node:http2'),crypto=require('node:crypto');
const [origin,path,range]=process.argv.slice(1);
const session=http2.connect(origin), hash=crypto.createHash('sha256');
let bytes=0,headers;
function fail(error){console.error(error.message);session.destroy();process.exitCode=1;}
session.on('error',fail);
const request=session.request({':path':path,cookie:'test_session=authenticated',...(range?{range}:{})});
request.on('error',fail);
request.on('response',value=>{headers=value;});
request.on('data',chunk=>{bytes+=chunk.length;hash.update(chunk);});
request.on('end',()=>{console.log(JSON.stringify({headers,bytes,sha256:hash.digest('hex')}));session.close();});
request.end();'''
                response = subprocess.run(['node', '-e', script, self.origin, ROUTE, range_header or ''],
                    capture_output=True, text=True, timeout=30)
                self.assertEqual(response.returncode, 0, response.stderr)
                result = json.loads(response.stdout)
                self.assertEqual(result['headers'][':status'], status)
                self.assertEqual(result['bytes'], len(DATA))
                self.assertEqual(result['sha256'], hashlib.sha256(DATA).hexdigest())

    def test_seek_ranges_head_and_authentication_are_preserved(self):
        for request, start, end in [('bytes=1000-1255', 1000, 1255), ('bytes=-64', len(DATA) - 64, len(DATA) - 1)]:
            with self.subTest(range=request), self.request(request) as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(response.headers['Content-Range'], f'bytes {start}-{end}/{len(DATA)}')
                self.assertEqual(response.read(), DATA[start:end + 1])
                self.assertEqual(response.headers['Cache-Control'], 'private, no-store')
        with self.request(method='HEAD') as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), b'')
            self.assertEqual(response.headers['Accept-Ranges'], 'bytes')
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(self.origin + ROUTE)
        self.assertEqual(error.exception.code, 401)
        error.exception.close()


if __name__ == '__main__':
    unittest.main()
