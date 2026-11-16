package com.sikai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/** Public registration never accepts administrator privilege. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    /**
     * Public account input; the service permits student/instructor roles and applies the BCrypt byte
     * limit.
     */
    record Register(@NotBlank @Size(min=2,max=80) String name,@NotBlank @Email @Size(max=254) String email,@NotNull @Size(min=8,max=128) String password,@NotNull String role) {}
    /** Login credentials are verified server-side and are never returned in a session response. */
    record Login(@NotBlank @Email String email,@NotNull @Size(max=128) String password) {}
    private final AuthService auth;

    /** Connect HTTP authentication endpoints to the server-side identity service. */
    public AuthController(AuthService auth) { this.auth=auth; }

    /** Validate public registration fields and create only a student or instructor session. */
    @PostMapping("/register") @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public Map<String,Object> register(@Valid @RequestBody Register r) { return auth.register(r.name,r.email,r.password,r.role); }

    /** Validate login JSON and exchange credentials for an expiring bearer session. */
    @PostMapping("/login") public Map<String,Object> login(@Valid @RequestBody Login r) { return auth.login(r.email,r.password); }

    /** Return the authenticated principal projection without password hashes or token digests. */
    @GetMapping("/me") public AuthService.User me(@AuthenticationPrincipal AuthService.User user) { return user; }

    /** Revoke only the bearer token supplied with this authenticated request. */
    @PostMapping("/logout") public Map<String,Boolean> logout(@RequestHeader("Authorization") String header) { auth.logout(header.substring(7)); return Map.of("success",true); }
}
