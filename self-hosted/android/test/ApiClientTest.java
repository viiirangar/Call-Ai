package be.callai.mobile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

public final class ApiClientTest {
    public static void main(String[] args) throws Exception {
        require(ApiClient.originOf(" https://Call.Example:443/ ").equals("https://call.example"));
        require(ApiClient.originOf("https://call.example:8443").equals("https://call.example:8443"));
        for (String bad : new String[]{"http://call.example", "https://user@call.example", "https://call.example/api", "https://call.example?x=1", "https://call.example#fragment", "https://call.example:99999"}) {
            try {
                ApiClient.originOf(bad);
                throw new AssertionError("Accepted invalid origin: " + bad);
            } catch (IllegalArgumentException expected) { }
        }
        String token = "f".repeat(64);
        require(ApiClient.sessionCookie("call_ai_session=" + token + "; Path=/; HttpOnly").equals("call_ai_session=" + token));
        require(ApiClient.sessionCookie("other=" + token).isEmpty());
        require(ApiClient.sessionCookie("call_ai_session=invalid; Path=/").isEmpty());
        require(ApiClient.encode("CV Français & moi").equals("CV+Fran%C3%A7ais+%26+moi"));
        byte[] input = "audio".getBytes(StandardCharsets.UTF_8);
        require(ApiClient.readLimited(new ByteArrayInputStream(input), 5).length == 5);
        try {
            ApiClient.readLimited(new ByteArrayInputStream(input), 4);
            throw new AssertionError("Accepted an oversized upload.");
        } catch (IOException expected) { }
        System.out.println("Verified HTTPS URL, private cookie, URL encoding and upload bounds.");
    }

    private static void require(boolean condition) {
        if (!condition) throw new AssertionError();
    }
}
