package com.sikai;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Optional first-run administrator; no default credentials or public admin registration. */
@Component
public class Bootstrap implements ApplicationRunner {
    private final Db db; private final PasswordEncoder encoder; private final String email,password;

    /** Read optional first-run administrator credentials without shipping a default account. */
    public Bootstrap(Db db,PasswordEncoder encoder,@Value("${sikai.admin-email}") String email,@Value("${sikai.admin-password}") String password) { this.db=db; this.encoder=encoder; this.email=email; this.password=password; }

    /**
     * Create a missing administrator at startup; never reset an existing password or promote a non-
     * admin email.
     */
    @Override public void run(ApplicationArguments args) {
        if(email.isBlank() && password.isBlank()) return;
        if(email.isBlank() || password.isBlank() || !email.contains("@")) throw new IllegalArgumentException("Set valid ADMIN_EMAIL and ADMIN_PASSWORD together");
        AuthService.checkPassword(password);
        String normalized=email.trim().toLowerCase(java.util.Locale.ROOT);
        var existing=db.list("SELECT role FROM app_user WHERE email=?",normalized);
        if(existing.isEmpty()) db.update("INSERT INTO app_user(id,name,email,password_hash,role) VALUES (?,?,?,?,?)",Db.id(),"Sikai Administrator",normalized,encoder.encode(password),"admin");
        else if(!"admin".equals(existing.get(0).get("role"))) throw new IllegalStateException("ADMIN_EMAIL belongs to a non-admin account");
    }
}
