package be.callai.mobile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;
import javax.net.ssl.HttpsURLConnection;

final class ApiClient {
    private static final Pattern SESSION = Pattern.compile("^call_ai_session=([a-f0-9]{64})(?:;|$)");
    final String origin;
    private String cookie = "";

    ApiClient(String input) { origin = originOf(input); }

    static String originOf(String input) {
        try {
            URI uri = new URI(input.trim());
            String path = uri.getRawPath();
            int port = uri.getPort();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null || port == 0 || port > 65535
                || path == null || (!path.isEmpty() && !path.equals("/"))) throw new URISyntaxException(input, "origin");
            return "https://" + uri.getHost().toLowerCase(Locale.ROOT) + (port == -1 || port == 443 ? "" : ":" + port);
        } catch (URISyntaxException exception) {
            throw new IllegalArgumentException("Saisissez l’adresse HTTPS du serveur, sans chemin.");
        }
    }

    static String sessionCookie(String header) {
        if (header == null) return "";
        var match = SESSION.matcher(header);
        return match.find() ? "call_ai_session=" + match.group(1) : "";
    }

    static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }

    String get(String path) throws IOException { return request("GET", path, null, null); }

    String json(String method, String path, String body) throws IOException {
        return request(method, path, "application/json", body.getBytes(StandardCharsets.UTF_8));
    }

    String request(String method, String path, String type, byte[] body) throws IOException {
        if (!path.startsWith("/api/")) throw new IllegalArgumentException("API route required");
        HttpsURLConnection connection = (HttpsURLConnection) URI.create(origin + path).toURL().openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(135_000);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Origin", origin);
            connection.setRequestProperty("Accept", "application/json");
            if (!cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
            if (body != null) {
                connection.setRequestProperty("Content-Type", type);
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream stream = connection.getOutputStream()) { stream.write(body); }
            }
            int status = connection.getResponseCode();
            if (path.equals("/api/session") && method.equals("POST") && status == 204) {
                cookie = sessionCookie(connection.getHeaderField("Set-Cookie"));
                if (cookie.isEmpty()) throw new IOException("Session absente.");
            }
            if (status == 204) return "";
            boolean ok = status >= 200 && status < 300;
            try (InputStream input = ok ? connection.getInputStream() : connection.getErrorStream()) {
                String text = input == null ? "" : new String(readLimited(input, 2 * 1024 * 1024), StandardCharsets.UTF_8);
                if (!ok) throw new ApiError(status, text);
                return text;
            }
        } finally {
            connection.disconnect();
        }
    }

    static byte[] readLimited(InputStream source, int limit) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = source.read(buffer)) != -1) {
            if (output.size() + count > limit) throw new PayloadTooLarge();
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    static final class PayloadTooLarge extends IOException { }

    static final class ApiError extends IOException {
        final int status;
        final String body;
        ApiError(int status, String body) { this.status = status; this.body = body; }
    }
}
