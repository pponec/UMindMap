/*
 * Run the UMind app over http (so localStorage auto-save works).
 *
 * A single-file Java 17 program — no build step, no *.class files. Run it with
 * the source-code launcher:
 *
 *     java run.java            # serve on http://localhost:8000/
 *     java run.java 9000       # serve on a custom port
 *
 * It is the Java counterpart of run.py: it serves the docs/ directory next to
 * this source file (the same files GitHub Pages publishes; works from any
 * working directory), opens the page in the default browser, and stops on
 * Ctrl+C.
 */

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.awt.Desktop;
import java.io.IOException;
import java.net.BindException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;

public class run {

    /** Port used when no argument is given. */
    private static final int DEFAULT_PORT = 8000;

    /**
     * Parse arguments, locate the web root, start the http server, open the
     * browser and block until the JVM is stopped (Ctrl+C).
     */
    public static void main(String[] args) throws Exception {
        var port = DEFAULT_PORT;
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                System.err.println("Invalid port: '" + args[0] + "'");
                System.exit(2);
            }
        }

        var root = webRoot();
        if (!Files.isRegularFile(root.resolve("index.html"))) {
            System.err.println("docs/index.html not found under " + root);
            System.exit(1);
        }

        // Bind up front so a busy port fails with a clear message, not a stack trace.
        HttpServer server;
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        } catch (BindException e) {
            System.err.println("Port " + port + " is already in use. Stop the process "
                    + "using it, or start on another port: java run.java <port>");
            System.exit(1);
            return; // unreachable, but keeps 'server' definitely assigned
        }
        server.createContext("/", exchange -> serve(exchange, root));
        server.setExecutor(null); // default executor keeps the JVM alive
        server.start();

        var url = "http://localhost:" + port + "/";
        System.out.println("UMind: " + url + "  (serving " + root + ")");
        System.out.println("Press Ctrl+C to stop.");

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("\nStopped.");
            server.stop(0);
        }));

        openBrowser(url);
        new CountDownLatch(1).await(); // park the main thread until Ctrl+C
    }

    /**
     * Resolve the web root: the docs/ directory next to this source file,
     * falling back to docs/ under the current working directory when the source
     * path is unknown.
     */
    private static Path webRoot() {
        var src = System.getProperty("jdk.launcher.sourcefile");
        var base = src != null
                ? Path.of(src).toAbsolutePath().getParent()
                : Path.of("").toAbsolutePath();
        return base.resolve("docs");
    }

    /**
     * Serve a single static file from the root directory. Maps "/" to
     * index.html, guards against path traversal, and returns 404 otherwise.
     */
    private static void serve(HttpExchange exchange, Path root) throws IOException {
        var decoded = URLDecoder.decode(exchange.getRequestURI().getPath(), StandardCharsets.UTF_8);
        if (decoded.isEmpty() || decoded.equals("/")) {
            decoded = "/index.html";
        }

        var target = root.resolve(decoded.substring(1)).normalize();
        if (!target.startsWith(root) || !Files.isRegularFile(target)) {
            var body = "404 Not Found".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
            exchange.sendResponseHeaders(404, body.length);
            try (var os = exchange.getResponseBody()) {
                os.write(body);
            }
            return;
        }

        var bytes = Files.readAllBytes(target);
        exchange.getResponseHeaders().set("Content-Type", contentType(target));
        exchange.sendResponseHeaders(200, bytes.length);
        try (var os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    /** Guess the Content-Type from the file extension. */
    private static String contentType(Path path) {
        var name = path.getFileName().toString();
        var dot = name.lastIndexOf('.');
        var ext = dot >= 0 ? name.substring(dot + 1).toLowerCase() : "";
        return switch (ext) {
            case "html", "htm" -> "text/html; charset=utf-8";
            case "js", "mjs" -> "text/javascript; charset=utf-8";
            case "css" -> "text/css; charset=utf-8";
            case "json", "map" -> "application/json; charset=utf-8";
            case "svg" -> "image/svg+xml";
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "gif" -> "image/gif";
            case "ico" -> "image/x-icon";
            case "woff2" -> "font/woff2";
            case "woff" -> "font/woff";
            case "txt" -> "text/plain; charset=utf-8";
            default -> "application/octet-stream";
        };
    }

    /**
     * Best-effort open of the URL in the default browser; failures are ignored
     * (e.g. a headless environment), the printed URL still works.
     */
    private static void openBrowser(String url) {
        try {
            if (Desktop.isDesktopSupported()
                    && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI.create(url));
                return;
            }
        } catch (Exception ignored) {
            // fall through to the platform opener
        }
        var os = System.getProperty("os.name", "").toLowerCase();
        var cmd = os.contains("win")
                ? new String[]{"rundll32", "url.dll,FileProtocolHandler", url}
                : os.contains("mac")
                ? new String[]{"open", url}
                : new String[]{"xdg-open", url};
        try {
            new ProcessBuilder(cmd).start();
        } catch (Exception ignored) {
            // headless / no opener available
        }
    }
}
