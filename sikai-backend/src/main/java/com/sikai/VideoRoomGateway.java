package com.sikai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import static org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE;

@Component
public class VideoRoomGateway {
    private final ObjectMapper json;
    private final String url;
    private final String key;
    private final String secret;
    private static final Base64.Encoder BASE64 = Base64.getUrlEncoder().withoutPadding();

    public VideoRoomGateway(ObjectMapper json, @Value("${LIVEKIT_URL:}") String url,
        @Value("${LIVEKIT_API_KEY:}") String key, @Value("${LIVEKIT_API_SECRET:}") String secret) {
        this.json = json;
        this.url = url;
        this.key = key;
        this.secret = secret;
        if (configured()) {
            var uri = URI.create(url);
            boolean local = "ws".equals(uri.getScheme()) && ("localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost()));
            if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || (!local && !"wss".equals(uri.getScheme()))) {
                throw new IllegalArgumentException("LIVEKIT_URL must use wss, or ws on localhost for development");
            }
        }
    }

    public boolean configured() { return !url.isBlank() && !key.isBlank() && !secret.isBlank(); }

    public Object credentials(String slotId, AuthService.User user, boolean instructor, long endMillis) {
        Db.require(configured(), SERVICE_UNAVAILABLE, "Sikai Video is not configured");
        long now = Instant.now().getEpochSecond();
        long expires = Math.min(now + 90, (endMillis + 999) / 1000);
        var sources = instructor ? List.of("camera", "microphone", "screen_share", "screen_share_audio")
            : List.of("camera", "microphone");
        var grant = Map.of("room", "sikai-" + slotId, "roomJoin", true, "canSubscribe", true,
            "canPublish", true, "canPublishSources", sources, "canPublishData", false);
        try {
            String header = BASE64.encodeToString(json.writeValueAsBytes(Map.of("typ", "JWT", "alg", "HS256")));
            String claims = BASE64.encodeToString(json.writeValueAsBytes(Map.of("iss", key, "sub", user.id(),
                "name", user.name(), "iat", now, "nbf", now, "exp", expires, "video", grant)));
            String unsigned = header + "." + claims;
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String token = unsigned + "." + BASE64.encodeToString(mac.doFinal(unsigned.getBytes(StandardCharsets.US_ASCII)));
            return Map.of("url", url, "token", token, "canShareScreen", instructor);
        } catch (java.security.GeneralSecurityException | com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("Unable to issue a classroom video token", e);
        }
    }
}
