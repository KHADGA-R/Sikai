package com.sikai;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

/** Revocable opaque bearer tokens; only SHA-256 digests are persisted, passwords use BCrypt. */
@Service
public class AuthService {
    /** Public principal/session projection; excludes password hashes and bearer token digests. */
    public record User(String id,String name,String email,String role) {}
    private final Db db;
    private final PasswordEncoder encoder;
    private final long hours;

    /** Configure password verification and validate the permitted token lifetime at startup. */
    public AuthService(Db db,PasswordEncoder encoder,@Value("${sikai.token-hours}") long hours) {
        this.db=db; this.encoder=encoder; this.hours=hours;
        if(hours<1 || hours>720) throw new IllegalArgumentException("TOKEN_HOURS must be 1..720");
    }

    /**
     * Normalize a unique email, validate the public role, hash the password and create the
     * user/session in one transaction.
     */
    @Transactional
    public Map<String,Object> register(String name,String email,String password,String role) {
        Db.require(Set.of("student","instructor").contains(role),BAD_REQUEST,"Choose student or instructor");
        email=email.trim().toLowerCase(Locale.ROOT);
        Db.require(!db.exists("SELECT id FROM app_user WHERE email=?",email),CONFLICT,"Email already registered");
        Db.require(name.trim().length()>=2,BAD_REQUEST,"Name must contain at least two characters");
        checkPassword(password);
        String id=Db.id();
        db.update("INSERT INTO app_user(id,name,email,password_hash,role) VALUES (?,?,?,?,?)",id,name.trim(),email,encoder.encode(password),role);
        return session(new User(id,name.trim(),email,role));
    }

    /**
     * Verify credentials against the normalized email and return the same failure for missing users or
     * wrong passwords.
     */
    public Map<String,Object> login(String email,String password) {
        var rows=db.list("SELECT * FROM app_user WHERE email=?",email.trim().toLowerCase(Locale.ROOT));
        Db.require(!rows.isEmpty() && encoder.matches(password,(String)rows.get(0).get("password_hash")),UNAUTHORIZED,"Email or password is incorrect");
        return session(user(rows.get(0)));
    }

    /**
     * Generate a cryptographically random bearer token, store only its digest and expiry, and return
     * the plaintext token once.
     */
    private Map<String,Object> session(User user) {
        byte[] bytes=new byte[32]; new SecureRandom().nextBytes(bytes);
        String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        long expiry=System.currentTimeMillis()+hours*3600000;
        db.update("DELETE FROM auth_token WHERE expires_at<=?",System.currentTimeMillis());
        db.update("INSERT INTO auth_token(token_hash,user_id,expires_at) VALUES (?,?,?)",digest(token),user.id(),expiry);
        return Map.of("token",token,"tokenType","Bearer","expiresAt",expiry,"user",user);
    }

    /** Resolve a token digest to the current user only while its persisted session has not expired. */
    public User authenticate(String token) {
        var rows=db.list("SELECT u.* FROM app_user u JOIN auth_token t ON t.user_id=u.id WHERE t.token_hash=? AND t.expires_at>?",digest(token),System.currentTimeMillis());
        return rows.isEmpty()?null:user(rows.get(0));
    }

    /** Delete the supplied token digest while leaving other sessions for the same account active. */
    public void logout(String token) { db.update("DELETE FROM auth_token WHERE token_hash=?",digest(token)); }

    /** Project a database user row into the public identity record, omitting password material. */
    private User user(Map<String,Object> row) { return new User((String)row.get("id"),(String)row.get("name"),(String)row.get("email"),(String)row.get("role")); }

    /** Enforce the minimum character length and BCrypt maximum of 72 UTF-8 bytes. */
    public static void checkPassword(String password) {
        Db.require(password.length()>=8 && password.getBytes(StandardCharsets.UTF_8).length<=72,BAD_REQUEST,"Password must be at least 8 characters and at most 72 UTF-8 bytes");
    }

    /** Compute a stable SHA-256 token digest for lookup without storing the usable bearer secret. */
    private static String digest(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch(NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
