package com.sikai;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class ClassroomGatewayTest {
    @Test void sharedRoomUsesParticipantRolesAndDisablesRecording() throws Exception {
        var requests = new CopyOnWriteArrayList<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        String origin = "http://127.0.0.1:" + server.getAddress().getPort();
        server.createContext("/bigbluebutton/api/", exchange -> {
            String action = exchange.getRequestURI().getPath().endsWith("/create") ? "create" : "join";
            requests.add(action + "?" + exchange.getRequestURI().getRawQuery());
            String xml = "<response><returncode>SUCCESS</returncode><url>" + origin + "/html5client/join?sessionToken=local</url></response>";
            byte[] body = xml.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (var stream = exchange.getResponseBody()) { stream.write(body); }
        });
        server.start();
        try {
            var gateway = new ClassroomGateway(origin + "/bigbluebutton/api/", "test-secret");
            var destinations = new ArrayList<String>();
            for (String role : List.of("instructor", "student", "classmate")) {
                var user = new AuthService.User(role, "Music & Art", role + "@example.test", role);
                destinations.add(gateway.join("slot-123", "Music", user, role.equals("instructor"), 300_000));
            }
            assertThat(destinations).containsOnly(origin + "/html5client/join?sessionToken=local");
            assertThat(requests).hasSize(6).allSatisfy(request -> {
                String[] signed = request.split("&checksum=", 2);
                String checksum = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest((signed[0].replace("?", "") + "test-secret").getBytes(StandardCharsets.UTF_8)));
                assertThat(signed[1]).isEqualTo(checksum);
                assertThat(request).contains("meetingID=sikai-slot-123");
            });
            assertThat(requests.get(0)).contains("record=false", "allowStartStopRecording=false", "autoStartRecording=false");
            assertThat(requests.get(1)).contains("role=MODERATOR", "fullName=Music+%26+Art");
            assertThat(requests.get(3)).contains("role=VIEWER", "userID=student");
            assertThat(requests.get(5)).contains("role=VIEWER", "userID=classmate");
        } finally {
            server.stop(0);
        }
    }
}
