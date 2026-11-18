package com.sikai;

import com.fasterxml.jackson.databind.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:sikai-notifications;MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sikai.upload-directory=target/notification-uploads","sikai.admin-email=","sikai.admin-password=","logging.level.root=WARN","debug=false"})
@AutoConfigureMockMvc
class NotificationIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    private JsonNode call(String method,String path,String token,Object body,int expected) throws Exception {
        var request=switch(method) { case "POST" -> post(path); case "PUT" -> put(path); case "PATCH" -> patch(path); case "DELETE" -> delete(path); default -> get(path); };
        if(token!=null) request.header("Authorization","Bearer "+token);
        if(body!=null) request.contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body));
        return mapper.readTree(mvc.perform(request).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
    private String account(String role) throws Exception { return call("POST","/api/auth/register",null,Map.of("name","Notification "+role,"email",UUID.randomUUID()+"@notification.example","password","NotifyPass123!","role",role),201).get("token").asText(); }
    private Map<String,Object> course() { return new HashMap<>(Map.of("title","Nepali foundations","description","Learn conversational Nepali","category","Languages","subcategory","Nepali","price",0,"level","BEGINNER","durationHours",2,"emoji","N","accent","teal","published",true)); }
    private long course(String teacher) throws Exception { return call("POST","/api/instructor/courses",teacher,course(),201).get("id").asLong(); }
    private Map<String,Object> lesson(String title) { return Map.of("title",title,"minutes",10,"kind","pdf","duration",0,"chapters",List.of(),"position",0); }
    private JsonNode inbox(String token) throws Exception { return call("GET","/api/me/notifications",token,null,200); }
    private long count(String token) throws Exception { return inbox(token).get("total").asLong(); }
    private String event(String token,String type) throws Exception {
        for(var item:inbox(token).get("items")) if(type.equals(item.get("type").asText())) return item.get("id").asText();
        throw new AssertionError("Missing notification: "+type);
    }

    @Test void enrollmentCompletionAndReadStateArePrivateAndIdempotent() throws Exception {
        String teacher=account("instructor"),student=account("student"),other=account("student"); long course=course(teacher);
        String topic=call("POST","/api/instructor/courses/"+course+"/topics",teacher,Map.of("title","Getting started","position",0),201).get("id").asText();
        long first=call("POST","/api/instructor/topics/"+topic+"/lessons",teacher,lesson("Greetings"),201).get("id").asLong();
        long second=call("POST","/api/instructor/topics/"+topic+"/lessons",teacher,lesson("Conversation"),201).get("id").asLong();
        call("PUT","/api/me/enrollments/"+course,student,null,200); call("PUT","/api/me/enrollments/"+course,student,null,200);
        assertThat(count(student)).isEqualTo(1); assertThat(count(teacher)).isEqualTo(1); assertThat(count(other)).isZero();
        String notification=event(student,"enrollment");
        call("GET","/api/me/notifications",null,null,401);
        call("GET","/api/me/notifications?size=51",student,null,400);
        call("PUT","/api/me/notifications/"+notification+"/read",other,null,404);
        assertThat(call("PUT","/api/me/notifications/"+notification+"/read",student,null,200).get("unreadCount").asInt()).isZero();
        assertThat(inbox(student).get("items").get(0).get("readAt").isNull()).isFalse();
        call("PUT","/api/me/progress/"+course+"/lessons/"+first,student,null,200);
        assertThat(count(student)).isEqualTo(1);
        call("PUT","/api/me/progress/"+course+"/lessons/"+second,student,null,200);
        call("PUT","/api/me/progress/"+course+"/lessons/"+second,student,null,200);
        call("DELETE","/api/me/progress/"+course+"/lessons/"+second,student,null,200);
        call("PUT","/api/me/progress/"+course+"/lessons/"+second,student,null,200);
        assertThat(count(student)).isEqualTo(2); assertThat(count(teacher)).isEqualTo(2);
        assertThat(event(student,"course_completed")).isNotBlank(); assertThat(event(teacher,"student_completed")).isNotBlank();
        call("POST","/api/me/notifications/read-all",teacher,null,200);
        assertThat(inbox(teacher).get("unreadCount").asInt()).isZero();
        assertThat(inbox(student).get("unreadCount").asInt()).isEqualTo(1);
        assertThat(count(other)).isZero();
    }

    @Test void checkoutNotifiesForEveryEnrolledCourseOnlyAfterCompletion() throws Exception {
        String teacher=account("instructor"),student=account("student"); long first=course(teacher),second=course(teacher);
        String order=call("POST","/api/checkout/orders",student,Map.of("courseIds",List.of(first,second)),200).get("id").asText();
        assertThat(count(student)).isZero(); assertThat(count(teacher)).isZero();
        call("POST","/api/checkout/orders/"+order+"/complete",student,null,200);
        call("POST","/api/checkout/orders/"+order+"/complete",student,null,200);
        assertThat(count(student)).isEqualTo(2); assertThat(count(teacher)).isEqualTo(2);
    }

    @Test void courseChangesAreCoalescedAndNoOpSavesDoNotNotify() throws Exception {
        String teacher=account("instructor"),student=account("student"),other=account("student"); long course=course(teacher);
        call("PUT","/api/me/enrollments/"+course,student,null,200); call("POST","/api/me/notifications/read-all",student,null,200);
        call("PUT","/api/instructor/courses/"+course,teacher,course(),200); assertThat(count(student)).isEqualTo(1);
        var changed=course(); changed.put("title","Updated Nepali foundations");
        call("PUT","/api/instructor/courses/"+course,teacher,changed,200);
        String topic=call("POST","/api/instructor/courses/"+course+"/topics",teacher,Map.of("title","New material","position",0),201).get("id").asText();
        long lesson=call("POST","/api/instructor/topics/"+topic+"/lessons",teacher,lesson("New lesson"),201).get("id").asLong();
        var file=new MockMultipartFile("file","new.pdf","application/pdf","%PDF-1.4 notification".getBytes());
        mvc.perform(multipart("/api/instructor/lessons/"+lesson+"/file").file(file).header("Authorization","Bearer "+teacher)).andExpect(status().isOk());
        assertThat(count(student)).isEqualTo(2); assertThat(inbox(student).get("unreadCount").asInt()).isEqualTo(1);
        assertThat(count(other)).isZero(); assertThat(count(teacher)).isEqualTo(1);
        String update=event(student,"course_updated"); call("PUT","/api/me/notifications/"+update+"/read",student,null,200);
        call("PUT","/api/instructor/courses/"+course,teacher,changed,200); assertThat(count(student)).isEqualTo(2);
        call("PUT","/api/instructor/lessons/"+lesson,teacher,lesson("Revised lesson"),200); assertThat(count(student)).isEqualTo(3);
        changed.put("published",false); call("PUT","/api/instructor/courses/"+course,teacher,changed,200);
        assertThat(count(student)).isEqualTo(3);
        var latest=inbox(student).get("items").get(0);
        assertThat(latest.get("title").asText()).isEqualTo("Course availability changed");
        assertThat(latest.get("target").asText()).isEqualTo("/my-learning");
    }

    @Test void liveClassEventsNotifyOnlyParticipantsAndCoalesceMessages() throws Exception {
        String teacher=account("instructor"),student=account("student"),other=account("student");
        call("PUT","/api/live-classes/teacher",teacher,Map.of("subject","Languages","bio","Nepali teacher","languages","Nepali"),200);
        long start=System.currentTimeMillis()+86400000;
        String slot=call("POST","/api/live-classes/slots",teacher,Map.of("start",start,"minutes",45,"meetingUrl","https://meet.example.test/original"),201).get("id").asText();
        String next=call("POST","/api/live-classes/slots",teacher,Map.of("start",start+7200000,"minutes",45,"meetingUrl",""),201).get("id").asText();
        String booking=call("POST","/api/live-classes/bookings",student,Map.of("slotId",slot,"goals","Private learning goals","timezone","UTC"),201).get("id").asText();
        assertThat(count(student)).isEqualTo(1); assertThat(count(teacher)).isEqualTo(1);
        call("POST","/api/live-classes/bookings/"+booking+"/messages",student,Map.of("text","Private message one"),201);
        call("POST","/api/live-classes/bookings/"+booking+"/messages",student,Map.of("text","Private message two"),201);
        assertThat(count(teacher)).isEqualTo(2); assertThat(count(student)).isEqualTo(1);
        call("PATCH","/api/live-classes/slots/"+slot+"/meeting",teacher,Map.of("meetingUrl","https://meet.example.test/changed"),200);
        assertThat(count(student)).isEqualTo(2);
        String replacement=call("POST","/api/live-classes/bookings",student,Map.of("slotId",next,"goals","","timezone","UTC","replacing",booking),201).get("id").asText();
        assertThat(event(student,"live_rescheduled")).isNotBlank(); assertThat(event(teacher,"live_rescheduled")).isNotBlank();
        call("POST","/api/live-classes/bookings/"+replacement+"/cancel",teacher,null,200);
        assertThat(event(student,"live_cancelled")).isNotBlank();
        assertThat(count(other)).isZero();
        assertThat(inbox(teacher).toString()).doesNotContain("Private message","Private learning goals","https://meet.");
    }
}
