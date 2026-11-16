package com.sikai;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Small parameterized JDBC adapter. SQL aliases define the public camelCase response fields. */
@Repository
public class Db {
    final JdbcTemplate jdbc;

    /** Use Spring's transaction-aware JDBC template for all parameterized SQL operations. */
    public Db(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /**
     * Execute a bound query and normalize unquoted column labels across H2/PostgreSQL while preserving
     * camelCase aliases.
     */
    public List<Map<String,Object>> list(String sql, Object... args) {
        // H2 can return unquoted labels in uppercase depending on its JDBC URL. Preserve quoted
        // camelCase aliases while giving every driver the same lowercase unquoted JSON fields.
        return jdbc.queryForList(sql,args).stream().map(row -> {
            Map<String,Object> normalized=new LinkedHashMap<>();
            row.forEach((key,value) -> normalized.put(key.equals(key.toUpperCase(Locale.ROOT)) ? key.toLowerCase(Locale.ROOT) : key,value));
            return normalized;
        }).toList();
    }

    /** Return the first matching record or fail with 404 when a required resource is absent. */
    public Map<String,Object> one(String sql, Object... args) {
        var rows=list(sql,args);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Record not found");
        return rows.get(0);
    }

    /** Check whether a parameterized query matches at least one record. */
    public boolean exists(String sql,Object...args) { return !list(sql,args).isEmpty(); }

    /** Execute a bound insert, update or delete and return the number of affected rows. */
    public int update(String sql,Object...args) { return jdbc.update(sql,args); }

    /** Insert a row and return its database-generated numeric ID through JDBC generated-key support. */
    public long insert(String sql,Object...args) {
        KeyHolder holder=new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement=connection.prepareStatement(sql,new String[]{"id"});
            for(int i=0;i<args.length;i++) statement.setObject(i+1,args[i]);
            return statement;
        },holder);
        return Objects.requireNonNull(holder.getKey()).longValue();
    }

    /** Generate a UUID for string-keyed domain records. */
    public static String id() { return UUID.randomUUID().toString(); }

    /** Stop an operation with an explicit HTTP status and safe message when a business rule fails. */
    public static void require(boolean condition,HttpStatus status,String message) {
        if(!condition) throw new ResponseStatusException(status,message);
    }
}
