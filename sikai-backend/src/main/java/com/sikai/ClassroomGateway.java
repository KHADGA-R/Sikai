package com.sikai;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.stream.Collectors;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.w3c.dom.Document;
import static org.springframework.http.HttpStatus.*;

@Component
public class ClassroomGateway {
    private final URI endpoint;
    private final String secret;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public ClassroomGateway(@Value("${BBB_API_URL:}") String url, @Value("${BBB_API_SECRET:}") String secret) {
        this.secret = secret;
        if (url.isBlank()) {
            endpoint = null;
            return;
        }
        endpoint = URI.create(url.replaceAll("/+$", "") + "/");
        boolean local = "http".equals(endpoint.getScheme()) && "127.0.0.1".equals(endpoint.getHost());
        if ((!local && !"https".equals(endpoint.getScheme())) || endpoint.getHost() == null
            || endpoint.getUserInfo() != null || endpoint.getQuery() != null || endpoint.getFragment() != null) {
            throw new IllegalArgumentException("BBB_API_URL must be an HTTPS API base URL or a local test endpoint");
        }
    }

    public boolean configured() { return endpoint != null && !secret.isBlank(); }

    public String join(String slotId, String subject, AuthService.User user, boolean instructor, long remainingMillis) {
        Db.require(configured(), SERVICE_UNAVAILABLE, "The instructor has not set up a classroom yet");
        String meetingId = "sikai-" + slotId;
        call("create", Map.of("meetingID", meetingId, "name", subject,
            "record", "false", "autoStartRecording", "false", "allowStartStopRecording", "false",
            "duration", Long.toString((remainingMillis + 59_999) / 60_000)));
        Document result = call("join", Map.of("meetingID", meetingId, "userID", user.id(),
            "fullName", user.name(), "role", instructor ? "MODERATOR" : "VIEWER", "redirect", "false"));
        try {
            URI destination = URI.create(field(result, "url"));
            if (endpoint.getScheme().equals(destination.getScheme()) && endpoint.getHost().equalsIgnoreCase(destination.getHost())
                && endpoint.getPort() == destination.getPort() && destination.getUserInfo() == null) {
                return destination.toString();
            }
        } catch (IllegalArgumentException ignored) { }
        throw new ResponseStatusException(BAD_GATEWAY, "The classroom returned an invalid join destination");
    }

    private Document call(String action, Map<String, String> params) {
        String query = params.entrySet().stream().sorted(Map.Entry.comparingByKey())
            .map(entry -> entry.getKey() + "=" + URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8))
            .collect(Collectors.joining("&"));
        try {
            byte[] signed = (action + query + secret).getBytes(StandardCharsets.UTF_8);
            String checksum = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(signed));
            var request = HttpRequest.newBuilder(endpoint.resolve(action + "?" + query + "&checksum=" + checksum))
                .timeout(Duration.ofSeconds(10)).GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (var body = response.body()) {
                if (response.statusCode() != 200) throw new IOException("Unexpected provider status");
                byte[] xml = body.readNBytes(65_537);
                if (xml.length > 65_536) throw new IOException("Unexpected provider response size");
                var factory = DocumentBuilderFactory.newInstance();
                factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
                factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
                factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
                var result = factory.newDocumentBuilder().parse(new ByteArrayInputStream(xml));
                if ("SUCCESS".equals(field(result, "returncode"))) return result;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (IOException | java.security.NoSuchAlgorithmException | javax.xml.parsers.ParserConfigurationException
            | org.xml.sax.SAXException ignored) { }
        throw new ResponseStatusException(BAD_GATEWAY, "The classroom server is unavailable. Try joining again.");
    }

    private static String field(Document document, String name) {
        var field = document.getElementsByTagName(name).item(0);
        return field == null ? "" : field.getTextContent().trim();
    }
}
