package com.sikai;

import com.fasterxml.jackson.databind.*;
import java.util.*;
import java.util.concurrent.*;
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

/** Tests real migrations, SQL, authentication and transactional booking rules against isolated H2. */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:sikai-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sikai.upload-directory=target/test-uploads","sikai.admin-email=admin@test.example","sikai.admin-password=AdminPass123!"})
@AutoConfigureMockMvc
class PlatformIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    private JsonNode json(MvcResult result) throws Exception { return mapper.readTree(result.getResponse().getContentAsString()); }
    private JsonNode request(String method,String path,String token,Object body,int status) throws Exception {
        var builder=switch(method) { case "POST"->post(path); case "PUT"->put(path); case "DELETE"->delete(path); default->get(path); };
        if(token!=null) builder.header("Authorization","Bearer "+token);
        if(body!=null) builder.contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body));
        return json(mvc.perform(builder).andExpect(status().is(status)).andReturn());
    }
    private String register(String role) throws Exception {
        return request("POST","/api/auth/register",null,Map.of("name","Test "+role,"email",UUID.randomUUID()+"@test.example","password","Pass12345!","role",role),201).get("token").asText();
    }
    private Map<String,Object> course(boolean free) { return Map.of("title","Nepali foundations","description","Learn conversational Nepali","category","Languages","subcategory","Nepali","price",free?0:10,"level","BEGINNER","durationHours",2,"emoji","N","accent","teal","published",true); }
    @Test void authenticationAndRoles() throws Exception {
        request("GET","/actuator/health",null,null,200);
        request("GET","/api/courses/not-a-number",null,null,400);
        request("POST","/api/auth/register",null,Map.of("name","Bad admin","email","bad@test.example","password","Pass12345!","role","admin"),400);
        String student=register("student");
        request("GET","/api/auth/me",student,null,200);
        request("GET","/api/admin/users",student,null,403);
        request("POST","/api/instructor/courses",student,course(true),403);
        request("GET","/api/me/enrollments",null,null,401);
        request("POST","/api/auth/login",null,Map.of("email","missing@test.example","password","wrong"),401);
        String admin=request("POST","/api/auth/login",null,Map.of("email","admin@test.example","password","AdminPass123!"),200).get("token").asText();
        request("GET","/api/admin/stats",admin,null,200);
        request("POST","/api/auth/logout",student,null,200);
        request("GET","/api/auth/me",student,null,401);
    }
    @Test void catalogLearningAndProtectedFiles() throws Exception {
        String instructor=register("instructor"),other=register("instructor"),student=register("student");
        long id=request("POST","/api/instructor/courses",instructor,course(true),201).get("id").asLong();
        request("PUT","/api/instructor/courses/"+id,other,course(true),403);
        request("GET","/api/courses/"+id,null,null,200);
        request("GET","/api/categories",null,null,200);
        request("GET","/api/courses?size=101",null,null,400);
        String topic=request("POST","/api/instructor/courses/"+id+"/topics",instructor,Map.of("title","Foundations","position",0),201).get("id").asText();
        long lesson=request("POST","/api/instructor/topics/"+topic+"/lessons",instructor,Map.of("title","Greetings","minutes",10,"kind","pdf","duration",0,"chapters",List.of(),"position",0),201).get("id").asLong();
        var file=new MockMultipartFile("file","greetings.pdf","application/pdf","%PDF-1.4 demo".getBytes());
        mvc.perform(multipart("/api/instructor/lessons/"+lesson+"/file").file(file).header("Authorization","Bearer "+instructor)).andExpect(status().isOk());
        request("GET","/api/courses/"+id+"/content",student,null,403);
        mvc.perform(get("/api/lessons/"+lesson+"/file").header("Authorization","Bearer "+student)).andExpect(status().isForbidden());
        request("PUT","/api/me/enrollments/"+id,student,null,200);
        request("PUT","/api/me/enrollments/"+id,student,null,200);
        request("GET","/api/courses/"+id+"/content",student,null,200);
        mvc.perform(get("/api/lessons/"+lesson+"/file").header("Authorization","Bearer "+student)).andExpect(status().isOk()).andExpect(content().bytes(file.getBytes()));
        request("PUT","/api/me/progress/"+id+"/lessons/"+lesson,student,null,200);
        assertThat(request("GET","/api/me/progress",student,null,200).get(""+id).get(0).asLong()).isEqualTo(lesson);
        request("PUT","/api/me/wishlist/"+id,student,null,200);
        request("DELETE","/api/me/wishlist/"+id,student,null,200);
        long paid=request("POST","/api/instructor/courses",instructor,course(false),201).get("id").asLong();
        request("PUT","/api/me/enrollments/"+paid,student,null,409);
    }
    @Test void liveBookingPrivacyReschedulingAndCancellation() throws Exception {
        String teacher=register("instructor"),student=register("student"),stranger=register("student");
        request("PUT","/api/live-classes/teacher",teacher,Map.of("subject","Languages","bio","Nepali teacher","languages","Nepali, English"),200);
        long start=System.currentTimeMillis()+86400000;
        String slot=request("POST","/api/live-classes/slots",teacher,Map.of("start",start,"minutes",45,"meetingUrl","https://meet.example.test/private"),201).get("id").asText();
        assertThat(request("GET","/api/live-classes/slots",null,null,200).toString()).doesNotContain("private");
        request("POST","/api/live-classes/slots",teacher,Map.of("start",start+1000,"minutes",45,"meetingUrl",""),409);
        String booking=request("POST","/api/live-classes/bookings",student,Map.of("slotId",slot,"goals","Conversation","timezone","Asia/Kathmandu"),201).get("id").asText();
        request("POST","/api/live-classes/bookings",stranger,Map.of("slotId",slot,"goals","","timezone","UTC"),409);
        request("POST","/api/live-classes/confirmation",stranger,Map.of("bookingId",booking),403);
        request("POST","/api/live-classes/bookings/"+booking+"/messages",stranger,Map.of("text","Intruder"),403);
        request("POST","/api/live-classes/bookings/"+booking+"/messages",teacher,Map.of("text","Welcome"),201);
        assertThat(request("GET","/api/live-classes/bookings",student,null,200).toString()).contains("private","Welcome");
        request("DELETE","/api/live-classes/slots/"+slot,teacher,null,409);
        String next=request("POST","/api/live-classes/slots",teacher,Map.of("start",start+3600000,"minutes",45,"meetingUrl",""),201).get("id").asText();
        String replacement=request("POST","/api/live-classes/bookings",student,Map.of("slotId",next,"goals","More practice","timezone","UTC","replacing",booking),201).get("id").asText();
        request("POST","/api/live-classes/bookings/"+replacement+"/cancel",teacher,null,200);
        request("POST","/api/live-classes/bookings/"+replacement+"/messages",teacher,Map.of("text","Too late"),409);
    }
    @Test void concurrentBookingHasExactlyOneWinner() throws Exception {
        String teacher=register("instructor"),a=register("student"),b=register("student");
        request("PUT","/api/live-classes/teacher",teacher,Map.of("subject","Music","bio","Music teacher","languages","Nepali"),200);
        String slot=request("POST","/api/live-classes/slots",teacher,Map.of("start",System.currentTimeMillis()+172800000,"minutes",30,"meetingUrl",""),201).get("id").asText();
        var pool=Executors.newFixedThreadPool(2); var gate=new CountDownLatch(1);
        try {
            List<Future<Integer>> results=new ArrayList<>();
            for(String token:List.of(a,b)) results.add(pool.submit(()-> { gate.await(); return mvc.perform(post("/api/live-classes/bookings").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(Map.of("slotId",slot,"goals","Practice","timezone","UTC")))).andReturn().getResponse().getStatus(); }));
            gate.countDown(); assertThat(List.of(results.get(0).get(15,TimeUnit.SECONDS),results.get(1).get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,409);
        } finally { pool.shutdownNow(); }
    }
}
