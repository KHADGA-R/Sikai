package com.sikai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Independent entry point. Configuration and migrations are loaded by Spring Boot. */
@SpringBootApplication(exclude=UserDetailsServiceAutoConfiguration.class)
@EnableScheduling
public class SikaiApplication {

    /**
     * Start the standalone Spring Boot API, including dependency configuration and Flyway schema
     * migration.
     */
    public static void main(String[] args) { SpringApplication.run(SikaiApplication.class, args); }
}
