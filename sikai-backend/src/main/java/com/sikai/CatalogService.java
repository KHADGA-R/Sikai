package com.sikai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

/** Catalog queries expose published records; mutations verify ownership independently of client IDs. */
@Service
public class CatalogService {
    /**
     * Editable catalog fields; identity, ownership, instructor name, lesson count and rating are
     * server-controlled.
     */
    public record CourseInput(@NotBlank @Size(min=4,max=160) String title,@NotBlank @Size(max=20000) String description,
        @NotBlank String category,String subcategory,@NotNull @DecimalMin("0.00") @DecimalMax("9999999999.99") @Digits(integer=10,fraction=2) BigDecimal price,
        @NotNull @Pattern(regexp="BEGINNER|INTERMEDIATE|ADVANCED") String level,@PositiveOrZero double durationHours,
        @NotBlank @Size(max=40) String emoji,@NotNull @Pattern(regexp="violet|teal|pink|blue|green|orange") String accent,boolean published,@Min(1) @Max(12) Integer grade,
        @Size(max=240) String summary,@Size(max=4000) String audience,@Size(max=4000) String prerequisites,
        @Size(max=4000) String outcomes,@Size(max=80) String language) {}
    public static final String SELECT="SELECT c.id,c.title,c.description,c.summary,c.audience,c.prerequisites,c.outcomes,c.language,c.cover_key AS \"coverAssetId\",u.name AS instructor,c.category,c.subcategory,c.price,(c.price=0) AS \"isFree\",c.level,c.rating,c.duration_hours AS \"durationHours\",(SELECT COUNT(*) FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE t.course_id=c.id) AS lessons,c.emoji,c.accent,c.published,c.grade,c.owner_id AS \"ownerId\" FROM course c JOIN app_user u ON u.id=c.owner_id";
    final Db db; private final ObjectMapper mapper;
    private final NotificationService notifications;

    /** Connect the catalog to parameterized SQL and the JSON taxonomy reader. */
    public CatalogService(Db db,ObjectMapper mapper,NotificationService notifications) { this.db=db; this.mapper=mapper; this.notifications=notifications; }

    /**
     * Read the packaged taxonomy resource; a missing or malformed resource is a server configuration
     * failure.
     */
    public List<Map<String,Object>> categories() {
        try(var stream=getClass().getResourceAsStream("/categories.json")) { return mapper.readValue(stream,new TypeReference<>(){}); }
        catch(Exception e) { throw new IllegalStateException("Cannot read categories",e); }
    }

    /** Reject unknown categories or subcategories that do not belong to the chosen category. */
    public void classification(String category,String subcategory) {
        var entry=categories().stream().filter(c->category.equals(c.get("name"))).findFirst();
        Db.require(entry.isPresent() && (subcategory==null || subcategory.isBlank() || ((List<?>)entry.get().get("subcategories")).contains(subcategory)),BAD_REQUEST,"Invalid category or subcategory");
    }

    /** Build parameterized discovery filters and validate pagination before querying published courses. */
    public List<Map<String,Object>> list(String query,String category,String level,Integer grade,Boolean free,int page,int size) {
        Db.require(page>=0 && page<=100000 && size>=1 && size<=100,BAD_REQUEST,"page must be 0..100000; size 1..100");
        StringBuilder sql=new StringBuilder(SELECT+" WHERE c.published=TRUE"); var args=new ArrayList<Object>();
        if(query!=null && !query.isBlank()) { sql.append(" AND LOWER(c.title) LIKE ?"); args.add("%"+query.toLowerCase(Locale.ROOT)+"%"); }
        if(category!=null) { sql.append(" AND c.category=?"); args.add(category); }
        if(level!=null) { sql.append(" AND c.level=?"); args.add(level); }
        if(grade!=null) { sql.append(" AND c.grade=?"); args.add(grade); }
        if(free!=null) sql.append(free?" AND c.price=0":" AND c.price>0");
        sql.append(" ORDER BY c.id LIMIT ? OFFSET ?"); args.add(size); args.add(page*size);
        return db.list(sql.toString(),args.toArray());
    }

    /** Load computed course fields and hide drafts from everyone except their owner or an administrator. */
    public Map<String,Object> course(long id,AuthService.User user) {
        var course=db.one(SELECT+" WHERE c.id=?",id);
        Db.require(Boolean.TRUE.equals(course.get("published")) || user!=null && (user.role().equals("admin") || user.id().equals(course.get("ownerId"))),NOT_FOUND,"Course not found"); return course;
    }

    /** Require an instructor or administrator before entering content-management operations. */
    public void instructor(AuthService.User user) { Db.require(user!=null && Set.of("instructor","admin").contains(user.role()),FORBIDDEN,"Instructor access required"); }

    /** Require teaching privileges and verify course ownership, with an administrator override. */
    public void owner(long id,AuthService.User user) {
        instructor(user); var course=db.one("SELECT owner_id FROM course WHERE id=?",id);
        Db.require(user.role().equals("admin") || user.id().equals(course.get("owner_id")),FORBIDDEN,"You can only manage your own courses");
    }

    /** Validate catalog data and insert a course whose owner is derived from the authenticated user. */
    @Transactional public long create(CourseInput c,AuthService.User user) {
        instructor(user); validate(c);
        long id=db.insert("INSERT INTO course(owner_id,title,description,category,subcategory,price,level,duration_hours,emoji,accent,published,grade) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",user.id(),c.title.trim(),c.description.trim(),c.category,c.subcategory,c.price,c.level,c.durationHours,c.emoji,c.accent,c.published,c.grade);
        updateDetails(id,c);
        return id;
    }

    /** Validate ownership and replace editable catalog fields within a database transaction. */
    @Transactional public void update(long id,CourseInput c,AuthService.User user) {
        owner(id,user); validate(c);
        var before=db.one("SELECT * FROM course WHERE id=? FOR UPDATE",id);
        db.update("UPDATE course SET title=?,description=?,category=?,subcategory=?,price=?,level=?,duration_hours=?,emoji=?,accent=?,published=?,grade=? WHERE id=?",c.title.trim(),c.description.trim(),c.category,c.subcategory,c.price,c.level,c.durationHours,c.emoji,c.accent,c.published,c.grade,id);
        updateDetails(id,c);
        var after=db.one("SELECT * FROM course WHERE id=?",id);
        if(!before.equals(after)) notifications.courseUpdated(id,Boolean.TRUE.equals(before.get("published")) && !c.published());
    }

    private void updateDetails(long id,CourseInput input) {
        db.update("UPDATE course SET summary=COALESCE(?,summary),audience=COALESCE(?,audience),prerequisites=COALESCE(?,prerequisites),outcomes=COALESCE(?,outcomes),language=COALESCE(?,language) WHERE id=?",
            input.summary(),input.audience(),input.prerequisites(),input.outcomes(),input.language(),id);
    }

    /** Apply cross-field category rules and reject non-finite duration values. */
    private void validate(CourseInput c) {
        classification(c.category,c.subcategory); Db.require(Double.isFinite(c.durationHours),BAD_REQUEST,"Duration must be finite");
    }

    /**
     * Require a visible course plus enrollment, ownership or administrator privileges before returning
     * protected lessons.
     */
    public void accessContent(long id,AuthService.User user) {
        var c=course(id,user);
        Db.require(user!=null && (user.role().equals("admin") || user.id().equals(c.get("ownerId")) || db.exists("SELECT user_id FROM enrollment WHERE user_id=? AND course_id=?",user.id(),id)),FORBIDDEN,"Enroll to access lessons");
    }
}
