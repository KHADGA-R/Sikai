package com.sikai;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import static org.springframework.http.HttpStatus.*;

/** Course hierarchy and protected media. UUID storage keys prevent client-controlled filesystem paths. */
@RestController
@RequestMapping("/api")
public class ContentController {
    /** Topic ordering is explicit and starts at zero; UUIDs are assigned by the server. */
    record TopicInput(@NotBlank @Size(max=160) String title,@PositiveOrZero int position) {}
    /** Chapter positions are seconds from the start of a media lesson, not epoch timestamps. */
    record Chapter(@PositiveOrZero double seconds,@NotBlank @Size(max=160) String title) {}
    /** Lesson metadata is JSON; the optional binary is uploaded separately through multipart field file. */
    record LessonInput(@NotBlank @Size(max=160) String title,@PositiveOrZero int minutes,@NotNull @Pattern(regexp="video|audio|pdf") String kind,@PositiveOrZero double duration,@NotNull @Size(max=500) List<@Valid Chapter> chapters,@PositiveOrZero int position) {}
    private final Db db; private final CatalogService catalog; private final ObjectMapper mapper; private final Path root;

    /** Resolve and create the configured upload root once; client filenames never choose storage paths. */
    public ContentController(Db db,CatalogService catalog,ObjectMapper mapper,@Value("${sikai.upload-directory}") String directory) throws java.io.IOException {
        this.db=db; this.catalog=catalog; this.mapper=mapper; root=Path.of(directory).toAbsolutePath().normalize(); Files.createDirectories(root);
    }

    /** Authorize course access and return ordered topics with decoded lesson chapters and file metadata. */
    @GetMapping("/courses/{courseId}/content") public Object content(@PathVariable long courseId,@AuthenticationPrincipal AuthService.User user) {
        catalog.accessContent(courseId,user);
        var topics=db.list("SELECT id,title,position FROM topic WHERE course_id=? ORDER BY position,id",courseId);
        for(var topic:topics) {
            var lessons=db.list("SELECT id,title,minutes,kind,duration,chapters,file_name AS \"fileName\",(file_key IS NOT NULL) AS \"hasFile\",position FROM lesson WHERE topic_id=? ORDER BY position,id",topic.get("id"));
            for(var lesson:lessons) { try { lesson.put("chapters",mapper.readTree((String)lesson.get("chapters"))); } catch(Exception e) { throw new IllegalStateException(e); } }
            topic.put("lessons",lessons);
        }
        return topics;
    }

    /** Create an owned course topic with a server-generated UUID and explicit ordering position. */
    @PostMapping("/instructor/courses/{courseId}/topics") @ResponseStatus(CREATED)
    public Object topic(@PathVariable long courseId,@Valid @RequestBody TopicInput input,@AuthenticationPrincipal AuthService.User user) {
        catalog.owner(courseId,user); String id=Db.id();
        db.update("INSERT INTO topic(id,course_id,title,position) VALUES (?,?,?,?)",id,courseId,input.title.trim(),input.position); return Map.of("id",id);
    }

    /** Authorize the owning course before changing the topic title or ordering. */
    @PutMapping("/instructor/topics/{id}") public Object updateTopic(@PathVariable String id,@Valid @RequestBody TopicInput input,@AuthenticationPrincipal AuthService.User user) {
        topicOwner(id,user); db.update("UPDATE topic SET title=?,position=? WHERE id=?",input.title.trim(),input.position,id); return Map.of("success",true);
    }

    /** Authorize ownership before removing a topic and its database-cascaded lessons. */
    @DeleteMapping("/instructor/topics/{id}") public Object deleteTopic(@PathVariable String id,@AuthenticationPrincipal AuthService.User user) { topicOwner(id,user); db.update("DELETE FROM topic WHERE id=?",id); return Map.of("success",true); }

    /** Create lesson metadata after validating topic ownership and kind-specific chapter constraints. */
    @PostMapping("/instructor/topics/{topicId}/lessons") @ResponseStatus(CREATED)
    public Object lesson(@PathVariable String topicId,@Valid @RequestBody LessonInput input,@AuthenticationPrincipal AuthService.User user) throws Exception {
        topicOwner(topicId,user); validate(input);
        long id=db.insert("INSERT INTO lesson(topic_id,title,minutes,kind,duration,chapters,position) VALUES (?,?,?,?,?,?,?)",topicId,input.title.trim(),input.minutes,input.kind,input.duration,mapper.writeValueAsString(input.chapters),input.position); return Map.of("id",id);
    }

    /** Replace owned lesson metadata and prohibit changing media kind while its old file remains attached. */
    @PutMapping("/instructor/lessons/{id}") public Object updateLesson(@PathVariable long id,@Valid @RequestBody LessonInput input,@AuthenticationPrincipal AuthService.User user) throws Exception {
        lessonOwner(id,user); validate(input);
        var old=db.one("SELECT kind,file_key FROM lesson WHERE id=?",id);
        Db.require(old.get("file_key")==null || old.get("kind").equals(input.kind),CONFLICT,"Delete the file before changing media kind");
        db.update("UPDATE lesson SET title=?,minutes=?,duration=?,kind=?,chapters=?,position=? WHERE id=?",input.title.trim(),input.minutes,input.duration,input.kind,mapper.writeValueAsString(input.chapters),input.position,id); return Map.of("success",true);
    }

    /** Delete an owned lesson and its completion records; disk cleanup remains a separate operation. */
    @DeleteMapping("/instructor/lessons/{id}") public Object deleteLesson(@PathVariable long id,@AuthenticationPrincipal AuthService.User user) { lessonOwner(id,user); db.update("DELETE FROM lesson WHERE id=?",id); return Map.of("success",true); }

    /**
     * Lock an owned lesson, validate file size/type and store the binary under a generated key.
     * Metadata update failures remove the new file, but filesystem and database commits are not fully
     * atomic.
     */
    @PostMapping(value="/instructor/lessons/{id}/file",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @Transactional
    public Object upload(@PathVariable long id,@RequestPart("file") MultipartFile file,@AuthenticationPrincipal AuthService.User user) throws Exception {
        lessonOwner(id,user); var lesson=db.one("SELECT kind FROM lesson WHERE id=? FOR UPDATE",id);
        Db.require(!file.isEmpty() && file.getSize()<=100L*1024*1024,BAD_REQUEST,"Upload a nonempty file up to 100 MB");
        String type=Objects.toString(file.getContentType(),"").toLowerCase(Locale.ROOT);
        Set<String> allowed=switch((String)lesson.get("kind")) { case "video"->Set.of("video/mp4","video/webm"); case "audio"->Set.of("audio/mpeg","audio/wav","audio/ogg","audio/mp4"); default->Set.of("application/pdf"); };
        Db.require(allowed.contains(type),BAD_REQUEST,"Unsupported media type for lesson kind");
        String key=Db.id(); Path destination=root.resolve(key);
        try(var stream=file.getInputStream()) { Files.copy(stream,destination); }
        String name=Objects.toString(file.getOriginalFilename(),"lesson").replaceAll("[\\\\/\\r\\n\\x00-\\x1F]","_");
        name=name.substring(0,Math.min(255,name.length()));
        try { db.update("UPDATE lesson SET file_key=?,file_name=?,content_type=? WHERE id=?",key,name,type,id); }
        catch(RuntimeException e) { Files.deleteIfExists(destination); throw e; }
        return Map.of("success",true,"fileName",name);
    }

    /** Remove the lesson's file reference without deleting its retained binary from disk. */
    @DeleteMapping("/instructor/lessons/{id}/file") public Object detach(@PathVariable long id,@AuthenticationPrincipal AuthService.User user) { lessonOwner(id,user); db.update("UPDATE lesson SET file_key=NULL,file_name=NULL,content_type=NULL WHERE id=?",id); return Map.of("success",true); }

    /** Authorize course content access and return the saved file as a private, non-cacheable attachment. */
    @GetMapping("/lessons/{id}/file") public ResponseEntity<Resource> download(@PathVariable long id,@AuthenticationPrincipal AuthService.User user) {
        var lesson=db.one("SELECT l.*,t.course_id FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE l.id=?",id);
        catalog.accessContent(((Number)lesson.get("course_id")).longValue(),user);
        Db.require(lesson.get("file_key")!=null,NOT_FOUND,"No file uploaded");
        Path path=root.resolve((String)lesson.get("file_key")).normalize(); Db.require(path.startsWith(root) && Files.isRegularFile(path),NOT_FOUND,"File not found");
        return ResponseEntity.ok().contentType(MediaType.parseMediaType((String)lesson.get("content_type")))
            .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename((String)lesson.get("file_name"),java.nio.charset.StandardCharsets.UTF_8).build().toString())
            .header(HttpHeaders.CACHE_CONTROL,"private, no-store").body(new FileSystemResource(path));
    }

    /** Resolve a topic to its course and apply the shared course ownership rule. */
    private void topicOwner(String id,AuthService.User user) { catalog.owner(((Number)db.one("SELECT course_id FROM topic WHERE id=?",id).get("course_id")).longValue(),user); }

    /** Resolve a lesson through its topic and apply the shared course ownership rule. */
    private void lessonOwner(long id,AuthService.User user) { catalog.owner(((Number)db.one("SELECT t.course_id FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE l.id=?",id).get("course_id")).longValue(),user); }

    /** Require finite durations, no PDF chapters and unique media timestamps inside the declared duration. */
    private void validate(LessonInput input) {
        Db.require(Double.isFinite(input.duration),BAD_REQUEST,"Duration must be finite");
        Db.require(!input.kind.equals("pdf") || input.chapters.isEmpty(),BAD_REQUEST,"PDF lessons cannot have chapters");
        Set<Double> times=new HashSet<>();
        for(var c:input.chapters) Db.require(Double.isFinite(c.seconds) && c.seconds<input.duration && times.add(c.seconds),BAD_REQUEST,"Chapter times must be unique and inside media duration");
    }
}
