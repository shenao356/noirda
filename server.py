import http.server
import socketserver
import socket
import webbrowser
import os
import sys

PORT = 8000

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "localhost"

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class CustomHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Evitar problemas de caché en el navegador
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def run_server():
    local_ip = get_local_ip()
    url_local = f"http://localhost:{PORT}"
    url_red = f"http://{local_ip}:{PORT}"

    print("=" * 65)
    print("      NOIRDA | SISTEMA DE CONTROL DE GASTOS Y CONTABILIDAD")
    print("      Propietario: Santiago Varelas")
    print("=" * 65)
    print(f"\n[+] Servidor iniciado correctamente.")
    print(f"\n[-] Para usar en esta computadora (PC):")
    print(f"    --> {url_local}")
    print(f"\n[-] Para usar desde tu CELULAR o TABLET (en la misma red Wi-Fi):")
    print(f"    --> {url_red}")
    print("\n[+] Consejo: En tu celular abre esa direccion en Chrome o Safari")
    print("    y presiona 'Agregar a pantalla de inicio' para tenerla como App.")
    print("\nPresiona CTRL + C en esta ventana para detener el servidor.")
    print("=" * 65 + "\n")

    # Abrir navegador automáticamente en la PC
    try:
        webbrowser.open(url_local)
    except Exception:
        pass

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), CustomHTTPHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido. ¡Hasta pronto, Santiago!")
            sys.exit(0)

if __name__ == "__main__":
    run_server()
