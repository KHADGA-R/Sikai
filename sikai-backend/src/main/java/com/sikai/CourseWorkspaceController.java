package com.sikai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validator;
import java.util.*;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import static org.springframework.http.HttpStatus.*;

/** Saves instructor drafts separately and publishes the curriculum in one transaction. */
@RestController
@RequestMapping("/api/instructor/workspaces")
@Transactional(rollbackFor=Exception.class)
public class CourseWorkspaceController {
    private final Db db;
    private final CatalogService catalog;
    private final ContentController content;
    private final ObjectMapper mapper;
    private final Validator validator;

    record Draft(long revision, JsonNode course) {}
    record Publication(long revision) {}

    public CourseWorkspaceController(Db db, CatalogService catalog, ContentController content, ObjectMapper mapper, Validator validator) {
        this.db=db; this.catalog=catalog; this.content=content; this.mapper=mapper; this.validator=validator;
    }

    @GetMapping
    public Object list(@AuthenticationPrincipal AuthService.User user) throws Exception {
        catalog.instructor(user);
        var result=new ArrayList<Draft>();
        for (var row:db.list("SELECT revision,payload FROM course_workspace WHERE owner_id=?",user.id())) {
            result.add(read(row));
        }
        return result;
    }

    @PutMapping("/{id}")
    public Draft save(@PathVariable String id,@RequestBody Draft draft,@AuthenticationPrincipal AuthService.User user) throws Exception {
        lock(user);
        Db.require(id.matches("[0-9]+|[0-9a-f-]{36}") && draft.course()!=null && draft.course().isObject()
            && id.equals(draft.course().path("id").asText()),BAD_REQUEST,"Invalid course draft");
        long publishedRevision=0;
        if(id.matches("[0-9]+")) {
            long courseId=Long.parseLong(id);
            catalog.owner(courseId,user);
            publishedRevision=((Number)db.one("SELECT authoring_revision FROM course WHERE id=?",courseId).get("authoring_revision")).longValue();
        }
        var rows=db.list("SELECT revision FROM course_workspace WHERE owner_id=? AND workspace_id=?",user.id(),id);
        long current=rows.isEmpty()?publishedRevision:((Number)rows.get(0).get("revision")).longValue();
        Db.require(current==draft.revision(),CONFLICT,"This draft changed in another tab. Reopen the editor before saving.");
        String payload=mapper.writeValueAsString(draft.course());
        Db.require(payload.length()<=1_000_000,BAD_REQUEST,"Course draft is too large");
        long revision=current+1;
        if(rows.isEmpty()) db.update("INSERT INTO course_workspace(owner_id,workspace_id,revision,payload) VALUES (?,?,?,?)",user.id(),id,revision,payload);
        else db.update("UPDATE course_workspace SET revision=?,payload=? WHERE owner_id=? AND workspace_id=?",revision,payload,user.id(),id);
        return new Draft(revision,draft.course());
    }

    @PostMapping(value="/assets",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public Object stage(@RequestPart("file") MultipartFile file,@AuthenticationPrincipal AuthService.User user) throws Exception {
        return content.stage(file,user);
    }

    @GetMapping("/assets/{id}")
    public ResponseEntity<Resource> asset(@PathVariable String id,@AuthenticationPrincipal AuthService.User user) {
        var asset=ownedAsset(id,user);
        return content.asset(id,(String)asset.get("file_name"),(String)asset.get("content_type"));
    }

    @PostMapping("/{id}/publish")
    public Object publish(@PathVariable String id,@RequestBody Publication publication,@AuthenticationPrincipal AuthService.User user) throws Exception {
        lock(user);
        Draft draft=read(db.one("SELECT revision,payload FROM course_workspace WHERE owner_id=? AND workspace_id=?",user.id(),id));
        Db.require(draft.revision()==publication.revision(),CONFLICT,"The draft changed. Reopen it before publishing.");
        JsonNode data=draft.course();
        boolean existing=id.matches("[0-9]+");
        CatalogService.CourseInput published=courseInput(data,true);
        long courseId=existing?Long.parseLong(id):catalog.create(courseInput(data,false),user);
        catalog.owner(courseId,user);
        db.one("SELECT id FROM course WHERE id=? FOR UPDATE",courseId);
        var topicIds=new HashSet<String>();
        var lessonIds=new HashSet<Long>();
        int topicPosition=0;
        int totalLessons=0;
        for(JsonNode topic:data.path("topics")) {
            var input=validate(new ContentController.TopicInput(topic.path("title").asText(),topicPosition++,topic.path("objective").asText()));
            String topicId=topic.path("id").asText();
            if(db.exists("SELECT id FROM topic WHERE id=? AND course_id=?",topicId,courseId)) {
                content.updateTopic(topicId,input,user);
            } else {
                @SuppressWarnings("unchecked")
                var created=(Map<String,Object>)content.topic(courseId,input,user);
                topicId=(String)created.get("id");
            }
            Db.require(topicIds.add(topicId),BAD_REQUEST,"A module appears more than once");
            int lessonPosition=0;
            for(JsonNode lesson:topic.path("lessons")) {
                long lessonId=publishLesson(lesson,topicId,lessonPosition++,courseId,user);
                Db.require(lessonIds.add(lessonId),BAD_REQUEST,"A lesson appears more than once");
                totalLessons++;
            }
        }
        Db.require(totalLessons>0,BAD_REQUEST,"Add at least one lesson before publishing");
        removeOmitted(courseId,topicIds,lessonIds,user);
        String cover=data.path("coverAssetId").asText("");
        if(!cover.isEmpty()) {
            var asset=ownedAsset(cover,user);
            Db.require(Set.of("image/png","image/jpeg").contains(asset.get("content_type")),BAD_REQUEST,"Choose a PNG or JPEG cover");
            db.update("UPDATE course SET cover_key=? WHERE id=?",cover,courseId);
        } else if(data.path("removeCover").asBoolean()) {
            db.update("UPDATE course SET cover_key=NULL WHERE id=?",courseId);
        }
        catalog.update(courseId,published,user);
        db.update("UPDATE course SET authoring_revision=? WHERE id=?",draft.revision()+1,courseId);
        db.update("DELETE FROM course_workspace WHERE owner_id=? AND workspace_id=?",user.id(),id);
        return Map.of("id",courseId);
    }

    private CatalogService.CourseInput courseInput(JsonNode data,boolean published) throws Exception {
        var input=data.deepCopy();
        var fields=(com.fasterxml.jackson.databind.node.ObjectNode)input;
        fields.put("published",published);
        return validate(mapper.treeToValue(fields,CatalogService.CourseInput.class));
    }

    private long publishLesson(JsonNode lesson,String topicId,int position,long courseId,AuthService.User user) throws Exception {
        var chapters=new ArrayList<ContentController.Chapter>();
        for(JsonNode chapter:lesson.path("chapters")) chapters.add(mapper.treeToValue(chapter,ContentController.Chapter.class));
        double duration=lesson.path("duration").asDouble();
        var input=validate(new ContentController.LessonInput(lesson.path("title").asText(),(int)Math.ceil(duration/60),
            lesson.path("kind").asText(),duration,chapters,position,lesson.path("description").asText(),
            lesson.path("freePreview").asBoolean(),topicId));
        String submittedId=lesson.path("id").asText();
        long id;
        if(submittedId.matches("[0-9]+")) {
            id=Long.parseLong(submittedId);
            Db.require(db.exists("SELECT l.id FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE l.id=? AND t.course_id=?",id,courseId),
                BAD_REQUEST,"A lesson no longer belongs to this course");
            content.updateLesson(id,input,user);
        } else {
            @SuppressWarnings("unchecked")
            var created=(Map<String,Object>)content.lesson(topicId,input,user);
            id=((Number)created.get("id")).longValue();
        }
        if(!lesson.path("assetId").asText().isEmpty()) {
            var asset=ownedAsset(lesson.path("assetId").asText(),user);
            String type=(String)asset.get("content_type");
            Db.require(type.startsWith(input.kind()+"/") || input.kind().equals("pdf") && type.equals("application/pdf"),
                BAD_REQUEST,"The lesson file does not match its type");
            db.update("UPDATE lesson SET file_key=?,file_name=?,content_type=? WHERE id=?",asset.get("id"),asset.get("file_name"),type,id);
        }
        Db.require(db.exists("SELECT id FROM lesson WHERE id=? AND file_key IS NOT NULL",id),BAD_REQUEST,"Upload a file for "+input.title());
        if(!lesson.path("slidesAssetId").asText().isEmpty()) {
            var asset=ownedAsset(lesson.path("slidesAssetId").asText(),user);
            Db.require("application/pdf".equals(asset.get("content_type")),BAD_REQUEST,"Slides must be a PDF");
            db.update("UPDATE lesson SET slides_key=?,slides_name=? WHERE id=?",asset.get("id"),asset.get("file_name"),id);
        } else if(lesson.path("removeSlides").asBoolean()) {
            content.detachSlides(id,user);
        }
        return id;
    }

    private void removeOmitted(long courseId,Set<String> topics,Set<Long> lessons,AuthService.User user) {
        for(var row:db.list("SELECT l.id FROM lesson l JOIN topic t ON t.id=l.topic_id WHERE t.course_id=?",courseId)) {
            long id=((Number)row.get("id")).longValue();
            if(!lessons.contains(id)) content.deleteLesson(id,user);
        }
        for(var row:db.list("SELECT id FROM topic WHERE course_id=?",courseId)) {
            String id=(String)row.get("id");
            if(!topics.contains(id)) content.deleteTopic(id,user);
        }
    }

    private Map<String,Object> ownedAsset(String id,AuthService.User user) {
        catalog.instructor(user);
        return db.one("SELECT id,file_name,content_type FROM course_asset WHERE id=? AND owner_id=?",id,user.id());
    }

    private Draft read(Map<String,Object> row) throws Exception {
        return new Draft(((Number)row.get("revision")).longValue(),mapper.readTree((String)row.get("payload")));
    }

    private void lock(AuthService.User user) {
        catalog.instructor(user);
        db.one("SELECT id FROM app_user WHERE id=? FOR UPDATE",user.id());
    }

    private <T> T validate(T input) {
        var issues=validator.validate(input);
        Db.require(issues.isEmpty(),BAD_REQUEST,issues.stream().map(issue->issue.getPropertyPath()+" "+issue.getMessage()).findFirst().orElse(""));
        return input;
    }
}
