package com.sikai;

import java.io.IOException;
import java.util.*;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.*;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.*;
import org.springframework.web.filter.OncePerRequestFilter;

/** Stateless Authorization-header authentication. No cookies are used, so CSRF is disabled. */
@Configuration
public class SecurityConfig {

    /** Provide BCrypt with work factor 12 for account creation and password verification. */
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
    /**
     * Configure stateless bearer authentication, public/admin route rules, restricted CORS and safe
     * security errors. CSRF is disabled because authentication is carried in a header rather than a
     * cookie.
     */
    @Bean SecurityFilterChain chain(HttpSecurity http,AuthService auth) throws Exception {
        return http.csrf(c->c.disable()).cors(c->{})
            .sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a->a
                .requestMatchers(HttpMethod.OPTIONS,"/**").permitAll()
                .requestMatchers(HttpMethod.GET,"/api/certificates/*").permitAll()
                .requestMatchers("/api/auth/register","/api/auth/login","/actuator/health").permitAll()
                .requestMatchers(HttpMethod.GET,"/api/courses","/api/courses/*","/api/courses/*/syllabus","/api/courses/*/preview/*","/api/courses/*/cover/*","/api/categories","/api/live-classes/teachers","/api/live-classes/slots","/api/live-classes/discovery").permitAll()
                .requestMatchers("/api/admin/**").hasRole("admin")
                .anyRequest().authenticated())
            .exceptionHandling(e->e.authenticationEntryPoint((req,res,ex)->write(res,401,"Authentication required"))
                .accessDeniedHandler((req,res,ex)->write(res,403,"Access denied")))
            .addFilterBefore(new OncePerRequestFilter() {

                /**
                 * Resolve an optional bearer token to the current user and role before continuing the
                 * security filter chain.
                 */
                @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
                    String header=req.getHeader("Authorization");
                    if(header!=null && header.startsWith("Bearer ")) {
                        var user=auth.authenticate(header.substring(7));
                        if(user!=null) SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user,null,List.of(new SimpleGrantedAuthority("ROLE_"+user.role()))));
                    }
                    chain.doFilter(req,res);
                }
            },UsernamePasswordAuthenticationFilter.class).build();
    }

    /**
     * Write the small JSON response used by authentication and authorization failures before
     * controller handling.
     */
    private static void write(HttpServletResponse response,int status,String message) throws IOException {
        response.setStatus(status); response.setContentType("application/json");
        response.getWriter().write("{\"status\":"+status+",\"message\":\""+message+"\"}");
    }

    /** Allow only configured frontend origins, supported REST methods and the required request headers. */
    @Bean CorsConfigurationSource cors(@Value("${sikai.cors-origins}") String origins) {
        var config=new CorsConfiguration(); config.setAllowedOrigins(Arrays.asList(origins.split(",")));
        config.setAllowedMethods(List.of("GET","POST","PUT","PATCH","DELETE","OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization","Content-Type")); config.setMaxAge(3600L);
        var source=new UrlBasedCorsConfigurationSource(); source.registerCorsConfiguration("/**",config); return source;
    }
}
