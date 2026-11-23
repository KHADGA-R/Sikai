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
        var builder=switch(method) { case "POST"->post(path); case "PUT"->put(path); case "PATCH"->patch(path); case "DELETE"->delete(path); default->get(path); };
        if(token!=null) builder.header("Authorization","Bearer "+token);
        if(body!=null) builder.contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body));
        return json(mvc.perform(builder).andExpect(status().is(status)).andReturn());
    }
    private String register(String role) throws Exception {
        return request("POST","/api/auth/register",null,Map.of("name","Test "+role,"email",UUID.randomUUID()+"@test.example","password","Pass12345!","role",role),201).get("token").asText();
    }
    private Map<String,Object> course(boolean free) { return Map.of("title","Nepali foundations","description","Learn conversational Nepali","category","Languages","subcategory","Nepali","price",free?0:10,"level","BEGINNER","durationHours",2,"emoji","N","accent","teal","published",true); }
    private String admin() throws Exception {
        return request("POST","/api/auth/login",null,Map.of("email","admin@test.example","password","AdminPass123!"),200).get("token").asText();
    }
    private Map<String,Object> coupon(String type,int value) {
        return new HashMap<>(Map.of("code","SAVE_"+UUID.randomUUID().toString().substring(0,8),"discountType",type,"discountValue",value,"minimumSubtotal",0,"active",true,"perUserLimit",1));
    }
    @Test void courseWorkspacePublishesAtomicallyAndRetainsLessonIdentity() throws Exception {
        String teacher=register("instructor"), other=register("instructor");
        String draftId=UUID.randomUUID().toString();
        String workspace="/api/instructor/workspaces/"+draftId;
        var file=new MockMultipartFile("file","recording.mp4","video/mp4",new byte[]{1,2,3});
        String asset=json(mvc.perform(multipart("/api/instructor/workspaces/assets").file(file)
            .header("Authorization","Bearer "+teacher)).andExpect(status().isOk()).andReturn()).path("id").asText();
        mvc.perform(get("/api/instructor/workspaces/assets/"+asset).header("Authorization","Bearer "+other))
            .andExpect(status().isNotFound());
        String topicId=UUID.randomUUID().toString();
        var lesson=new HashMap<String,Object>(Map.of("id",UUID.randomUUID().toString(),"title","Original lesson",
            "kind","video","duration",120,"assetId",asset,"freePreview",true));
        var topic=new HashMap<String,Object>(Map.of("id",topicId,"title","Module one","lessons",List.of(lesson)));
        var draft=new HashMap<>(course(true));
        draft.put("id",draftId);
        draft.put("summary","Learn with recordings");
        draft.put("topics",List.of(topic));
        request("PUT",workspace,teacher,Map.of("revision",0,"course",draft),200);
        request("PUT",workspace,teacher,Map.of("revision",0,"course",draft),409);
        assertThat(request("GET","/api/instructor/workspaces",other,null,200)).isEmpty();
        assertThat(request("GET","/api/instructor/courses",teacher,null,200)).isEmpty();
        long courseId=request("POST",workspace+"/publish",teacher,Map.of("revision",1),200).path("id").asLong();
        String courseUrl="/api/courses/"+courseId;
        JsonNode syllabus=request("GET",courseUrl+"/syllabus",null,null,200);
        String publishedTopic=syllabus.path(0).path("id").asText();
        long lessonId=syllabus.path(0).path("lessons").path(0).path("id").asLong();
        assertThat(request("GET",courseUrl,null,null,200).path("summary").asText()).isEqualTo("Learn with recordings");
        mvc.perform(get(courseUrl+"/preview/"+lessonId)).andExpect(status().isOk()).andExpect(content().bytes(new byte[]{1,2,3}));
        mvc.perform(get("/api/lessons/"+lessonId+"/file")).andExpect(status().isUnauthorized());
        lesson.put("id",String.valueOf(lessonId));
        lesson.remove("assetId");
        lesson.put("title","Updated recording");
        lesson.put("freePreview",false);
        topic.put("id",publishedTopic);
        draft.put("id",String.valueOf(courseId));
        String update="/api/instructor/workspaces/"+courseId;
        request("PUT",update,teacher,Map.of("revision",0,"course",draft),409);
        request("PUT",update,teacher,Map.of("revision",2,"course",draft),200);
        assertThat(request("GET",courseUrl+"/syllabus",null,null,200).at("/0/lessons/0/title").asText()).isEqualTo("Original lesson");
        request("POST",update+"/publish",teacher,Map.of("revision",3),200);
        var published=request("GET",courseUrl+"/syllabus",null,null,200).at("/0/lessons/0");
        assertThat(published.path("title").asText()).isEqualTo("Updated recording");
        assertThat(published.path("id").asLong()).isEqualTo(lessonId);
        mvc.perform(get(courseUrl+"/preview/"+lessonId)).andExpect(status().isNotFound());
    }
    @Test void couponsAreAdminManagedPrivateAndServerPriced() throws Exception {
        String admin=admin(),student=register("student"),other=register("student"),teacher=register("instructor");
        var data=coupon("percent",25);
        request("POST","/api/admin/coupons",student,data,403);
        var invalid=coupon("percent",101); request("POST","/api/admin/coupons",admin,invalid,400);
        var created=request("POST","/api/admin/coupons",admin,data,201);
        long first=request("POST","/api/instructor/courses",teacher,course(false),201).get("id").asLong();
        long second=request("POST","/api/instructor/courses",teacher,course(false),201).get("id").asLong();
        String order=request("POST","/api/checkout/orders",student,Map.of("courseIds",List.of(first,second)),200).get("id").asText();
        String path="/api/checkout/orders/"+order+"/coupon";
        request("PUT",path,other,Map.of("code",created.get("code").asText()),404);
        var quote=request("PUT",path,student,Map.of("code"," "+created.get("code").asText().toLowerCase()+" ","discountAmount",20),200);
        assertThat(quote.get("subtotal").decimalValue()).isEqualByComparingTo("20");
        assertThat(quote.get("discountAmount").decimalValue()).isEqualByComparingTo("5");
        assertThat(quote.get("originalAmount").decimalValue()).isEqualByComparingTo("15");
        request("PUT",path,student,Map.of("code","NOT_REAL"),400);
        assertThat(request("DELETE",path,student,null,200).get("originalAmount").decimalValue()).isEqualByComparingTo("20");
        request("PUT","/api/admin/coupons/"+created.get("id").asText()+"/status",admin,Map.of("active",false),200);
        request("PUT",path,student,Map.of("code",created.get("code").asText()),400);
        var fixed=request("POST","/api/admin/coupons",admin,coupon("fixed",50),201);
        assertThat(request("PUT",path,student,Map.of("code",fixed.get("code").asText()),200).get("originalAmount").decimalValue()).isZero();
        request("POST","/api/checkout/orders/"+order+"/complete",student,null,200);
        request("POST","/api/checkout/orders/"+order+"/complete",student,null,200);
        assertThat(request("GET","/api/me/enrollments",student,null,200)).hasSize(2);
        request("DELETE",path,student,null,409);
        long third=request("POST","/api/instructor/courses",teacher,course(false),201).get("id").asLong();
        String another=request("POST","/api/checkout/orders",student,Map.of("courseId",third),200).get("id").asText();
        request("PUT","/api/checkout/orders/"+another+"/coupon",student,Map.of("code",fixed.get("code").asText()),400);
    }
    @Test void couponEligibilityAndGlobalLimitAreRecheckedAtCompletion() throws Exception {
        String admin=admin(),teacher=register("instructor"),buyer=register("student"),other=register("student");
        long course=request("POST","/api/instructor/courses",teacher,course(false),201).get("id").asLong();
        String order=request("POST","/api/checkout/orders",buyer,Map.of("courseId",course),200).get("id").asText();
        for(String rule:List.of("expiresAt","startsAt","minimumSubtotal")) {
            var data=coupon("percent",100);
            data.put(rule,rule.equals("expiresAt")?System.currentTimeMillis()-60000:rule.equals("startsAt")?System.currentTimeMillis()+60000:20);
            String code=request("POST","/api/admin/coupons",admin,data,201).get("code").asText();
            request("PUT","/api/checkout/orders/"+order+"/coupon",buyer,Map.of("code",code),400);
        }
        var data=coupon("percent",100); data.put("maxRedemptions",1);
        String code=request("POST","/api/admin/coupons",admin,data,201).get("code").asText();
        String second=request("POST","/api/checkout/orders",other,Map.of("courseId",course),200).get("id").asText();
        request("PUT","/api/checkout/orders/"+order+"/coupon",buyer,Map.of("code",code),200);
        request("PUT","/api/checkout/orders/"+second+"/coupon",other,Map.of("code",code),200);
        request("POST","/api/checkout/orders/"+order+"/complete",buyer,null,200);
        request("POST","/api/checkout/orders/"+second+"/complete",other,null,400);
        assertThat(request("GET","/api/me/enrollments",other,null,200)).isEmpty();
    }
    @Test void checkoutOrdersArePrivateIdempotentAndServerPriced() throws Exception {
        String teacher=register("instructor"),buyer=register("student"),other=register("student");
        long id=request("POST","/api/instructor/courses",teacher,course(true),201).get("id").asLong();
        request("POST","/api/checkout/orders",null,Map.of("courseId",id),401);
        request("POST","/api/checkout/orders",buyer,Map.of("courseId",0),400);
        String order=request("POST","/api/checkout/orders",buyer,Map.of("courseId",id),200).get("id").asText();
        assertThat(request("POST","/api/checkout/orders",buyer,Map.of("courseId",id),200).get("id").asText()).isEqualTo(order);
        request("GET","/api/checkout/orders/"+order,other,null,404);
        request("POST","/api/checkout/orders/"+order+"/complete",other,null,404);
        assertThat(request("POST","/api/checkout/orders/"+order+"/complete",buyer,null,200).get("status").asText()).isEqualTo("completed");
        request("POST","/api/checkout/orders/"+order+"/complete",buyer,null,200);
        assertThat(request("GET","/api/me/enrollments",buyer,null,200)).hasSize(1);
        long paid=request("POST","/api/instructor/courses",teacher,course(false),201).get("id").asLong();
        JsonNode paidOrder=request("POST","/api/checkout/orders",buyer,Map.of("courseId",paid,"amount",0,"status","completed"),200);
        assertThat(paidOrder.get("amount").decimalValue()).isEqualByComparingTo("10");
        request("POST","/api/checkout/orders/"+paidOrder.get("id").asText()+"/complete",buyer,null,409);
        assertThat(request("GET","/api/me/enrollments",buyer,null,200)).hasSize(1);
        long changed=request("POST","/api/instructor/courses",teacher,course(true),201).get("id").asLong();
        String changedOrder=request("POST","/api/checkout/orders",buyer,Map.of("courseId",changed),200).get("id").asText();
        request("PUT","/api/instructor/courses/"+changed,teacher,course(false),200);
        request("POST","/api/checkout/orders/"+changedOrder+"/complete",buyer,null,409);
        var draft=new HashMap<>(course(true)); draft.put("published",false);
        long hidden=request("POST","/api/instructor/courses",teacher,draft,201).get("id").asLong();
        request("POST","/api/checkout/orders",buyer,Map.of("courseId",hidden),404);
    }

    @Test void cartCheckoutIsAccountScopedDeduplicatedAndCompletesAllFreeCourses() throws Exception {
        String teacher=register("instructor"),student=register("student"),other=register("student");
        long first=request("POST","/api/instructor/courses",teacher,course(true),201).get("id").asLong();
        long second=request("POST","/api/instructor/courses",teacher,course(true),201).get("id").asLong();
        request("PUT","/api/me/cart/"+first,null,null,401);
        request("PUT","/api/me/cart/"+first,student,null,200);
        request("PUT","/api/me/cart/"+first,student,null,200);
        request("PUT","/api/me/cart/"+second,student,null,200);
        assertThat(request("GET","/api/me/cart",student,null,200)).hasSize(2);
        assertThat(request("GET","/api/me/cart",other,null,200)).isEmpty();
        request("DELETE","/api/me/cart/"+first,other,null,200);
        assertThat(request("GET","/api/me/cart",student,null,200)).hasSize(2);
        request("POST","/api/checkout/orders",student,Map.of("courseIds",List.of()),400);
        request("POST","/api/checkout/orders",student,Map.of("courseId",first,"courseIds",List.of(second)),400);
        var order=request("POST","/api/checkout/orders",student,Map.of("courseIds",List.of(second,first,first),"amount",-10),200);
        String id=order.get("id").asText();
        assertThat(order.get("items")).hasSize(2);
        assertThat(request("POST","/api/checkout/orders",student,Map.of("courseIds",List.of(first,second)),200).get("id").asText()).isEqualTo(id);
        request("GET","/api/checkout/orders/"+id+"/quote",other,null,404);
        request("POST","/api/checkout/orders/"+id+"/complete",other,null,404);
        assertThat(request("POST","/api/checkout/orders/"+id+"/complete",student,null,200).get("status").asText()).isEqualTo("completed");
        request("POST","/api/checkout/orders/"+id+"/complete",student,null,200);
        assertThat(request("GET","/api/me/enrollments",student,null,200)).hasSize(2);
        assertThat(request("GET","/api/me/cart",student,null,200)).isEmpty();
        request("PUT","/api/me/cart/"+first,student,null,409);
    }

    @Test void cartRejectsPriceChangesAndUnavailableItemsWithoutPartialEnrollment() throws Exception {
        String teacher=register("instructor"),student=register("student");
        long first=request("POST","/api/instructor/courses",teacher,course(true),201).get("id").asLong();
        long second=request("POST","/api/instructor/courses",teacher,course(true),201).get("id").asLong();
        String id=request("POST","/api/checkout/orders",student,Map.of("courseIds",List.of(first,second)),200).get("id").asText();
        request("PUT","/api/instructor/courses/"+second,teacher,course(false),200);
        request("POST","/api/checkout/orders/"+id+"/complete",student,null,409);
        assertThat(request("GET","/api/me/enrollments",student,null,200)).isEmpty();
        var refreshed=request("POST","/api/checkout/orders",student,Map.of("courseIds",List.of(first,second)),200);
        assertThat(refreshed.get("amount").decimalValue()).isEqualByComparingTo("10");
        var draft=new HashMap<>(course(false)); draft.put("published",false);
        request("PUT","/api/instructor/courses/"+second,teacher,draft,200);
        request("POST","/api/checkout/orders/"+id+"/complete",student,null,409);
        assertThat(request("GET","/api/me/enrollments",student,null,200)).isEmpty();
    }

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
        request("PUT","/api/me/certificates/"+id,student,null,409);
        request("GET","/api/courses/"+id+"/content",student,null,200);
        mvc.perform(get("/api/lessons/"+lesson+"/file").header("Authorization","Bearer "+student)).andExpect(status().isOk()).andExpect(content().bytes(file.getBytes()));
        request("PUT","/api/me/progress/"+id+"/lessons/"+lesson,student,null,200);
        assertThat(request("GET","/api/me/progress",student,null,200).get(""+id).get(0).asLong()).isEqualTo(lesson);
        String certificateRoute="/api/me/certificates/"+id;
        var certificate=request("PUT",certificateRoute,student,null,200);
        String certificateId=certificate.get("id").asText();
        assertThat(certificate.get("shared").asBoolean()).isFalse();
        assertThat(certificate.get("instructor").asText()).isEqualTo("Test instructor");
        assertThat(certificate.get("durationHours").asDouble()).isEqualTo(2);
        assertThat(certificate.get("level").asText()).isEqualTo("BEGINNER");
        assertThat(certificate.get("completedAt").asLong()).isBetween(1L,certificate.get("issuedAt").asLong());
        assertThat(request("PUT",certificateRoute,student,null,200)).isEqualTo(certificate);
        request("GET",certificateRoute,other,null,404);
        String sharingRoute="/api/me/certificates/"+certificateId;
        String verificationRoute="/api/certificates/"+certificateId;
        request("GET",verificationRoute,null,null,404);
        request("PATCH",sharingRoute,other,Map.of("shared",true),404);
        request("PATCH",sharingRoute,student,Map.of("shared",true),200);
        var verified=request("GET",verificationRoute,null,null,200);
        assertThat(verified.get("recipient")).isEqualTo(certificate.get("recipient"));
        assertThat(verified.get("completedAt")).isEqualTo(certificate.get("completedAt"));
        assertThat(verified.has("email")).isFalse();
        assertThat(verified.has("userId")).isFalse();
        request("PATCH",sharingRoute,student,Map.of("shared",false),200);
        request("GET",verificationRoute,null,null,404);
        request("PUT","/api/me/wishlist/"+id,student,null,200);
        request("DELETE","/api/me/wishlist/"+id,student,null,200);
        long paid=request("POST","/api/instructor/courses",instructor,course(false),201).get("id").asLong();
        request("PUT","/api/me/enrollments/"+paid,student,null,409);
    }
    @Test void discoveryOrdersOpenTimesChronologicallyAndExposesAggregateCounts() throws Exception {
        String teacher=register("instructor"), other=register("instructor"), student=register("student");
        var profile=Map.of("subject","Music","bio","Music teacher","languages","Nepali");
        String id=request("PUT","/api/live-classes/teacher",teacher,profile,200).get("id").asText();
        String otherId=request("PUT","/api/live-classes/teacher",other,profile,200).get("id").asText();
        long start=System.currentTimeMillis()+600000L;
        for (int hour=0; hour<9; hour++) {
            String slot=request("POST","/api/live-classes/slots",teacher,
                Map.of("start",start+hour*3600000L,"minutes",30,"meetingUrl","https://example.test/private"),201).get("id").asText();
            if (hour<3) request("POST","/api/live-classes/bookings",student,Map.of("slotId",slot,"goals","","timezone","UTC"),201);
        }
        request("POST","/api/live-classes/slots",other,Map.of("start",start,"minutes",30,"meetingUrl",""),201);
        var classes=request("GET","/api/live-classes/discovery",null,null,200);
        assertThat(classes).hasSize(5);
        assertThat(classes.get(0).get("teacherId").asText()).isEqualTo(otherId);
        assertThat(classes.get(0).get("start").asLong()).isEqualTo(start);
        assertThat(classes.get(0).get("end").asLong()).isEqualTo(start+1800000L);
        assertThat(classes.get(1).get("teacherId").asText()).isEqualTo(id);
        assertThat(classes.get(1).get("start").asLong()).isEqualTo(start+3*3600000L);
        assertThat(classes.get(1).get("recentBookings").asInt()).isEqualTo(3);
        assertThat(classes.toString()).doesNotContain("private", "meetingUrl", "studentId");

        long courseId=request("POST","/api/instructor/courses",teacher,course(true),201).get("id").asLong();
        request("PUT","/api/me/enrollments/"+courseId,student,null,200);
        var courseDetails=request("GET","/api/courses/"+courseId,null,null,200);
        assertThat(courseDetails.get("enrollmentCount").asInt()).isEqualTo(1);
        assertThat(courseDetails.get("recentEnrollmentCount").asInt()).isEqualTo(1);
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
    @Test void groupSeatsAndJoinAccessAreCheckedPerStudent() throws Exception {
        String teacher=register("instructor"), first=register("student"), second=register("student"), third=register("student");
        request("PUT","/api/live-classes/teacher",teacher,Map.of("subject","Music","bio","Group lessons","languages","Nepali"),200);
        String room="https://meet.example.test/group";
        long start=System.currentTimeMillis()+3_600_000;
        String slot=request("POST","/api/live-classes/slots",teacher,
            Map.of("start",start,"minutes",30,"meetingUrl",room,"capacity",2),201).path("id").asText();
        String join="/api/live-classes/slots/"+slot+"/join";
        var booking=Map.of("slotId",slot,"goals","","timezone","UTC");
        request("POST",join,null,null,401);
        request("POST",join,third,null,403);
        String firstBooking=request("POST","/api/live-classes/bookings",first,booking,201).path("id").asText();
        assertThat(request("GET","/api/live-classes/slots",null,null,200)).anySatisfy(row -> {
            assertThat(row.path("id").asText()).isEqualTo(slot);
            assertThat(row.path("seatsRemaining").asInt()).isEqualTo(1);
            assertThat(row.has("meetingUrl")).isFalse();
        });
        request("POST","/api/live-classes/bookings",first,booking,409);
        request("POST","/api/live-classes/bookings",second,booking,201);
        request("POST","/api/live-classes/bookings",third,booking,409);
        for(String token:List.of(teacher,first,second)){
            assertThat(request("POST",join,token,null,200).path("url").asText()).isEqualTo(room);
        }
        request("POST","/api/live-classes/bookings/"+firstBooking+"/cancel",first,null,200);
        request("POST",join,first,null,403);
        request("POST","/api/live-classes/bookings",third,booking,201);
    }
    @Test void whiteboardSharesSlidesAndKeepsMarksByAuthor() throws Exception {
        String teacher=register("instructor"), first=register("student"), second=register("student"), outsider=register("student");
        request("PUT","/api/live-classes/teacher",teacher,Map.of("subject","Music","bio","Group lessons","languages","Nepali"),200);
        String slot=request("POST","/api/live-classes/slots",teacher,Map.of("start",System.currentTimeMillis()+3_600_000,
            "minutes",30,"meetingUrl","","capacity",2),201).path("id").asText();
        String board="/api/live-classes/slots/"+slot+"/whiteboard";
        var booking=Map.of("slotId",slot,"goals","","timezone","UTC");
        request("POST","/api/live-classes/bookings",first,booking,201);
        request("POST","/api/live-classes/bookings",second,booking,201);
        request("GET",board,null,null,401);
        request("GET",board,outsider,null,403);
        var slideInput=Map.of("title","Rhythm","image","data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");
        request("POST",board+"/slides",first,slideInput,403);
        String slide=request("POST",board+"/slides",teacher,slideInput,200).path("id").asText();
        assertThat(request("GET",board+"/slides/"+slide,second,null,200).path("image").asText()).isEqualTo(slideInput.get("image"));
        var point=Map.of("x",0.2,"y",0.4);
        var stroke=Map.of("slideId",slide,"tool","highlighter","color","#ffee00","points",List.of(point),"label","");
        String teacherMark=request("POST",board+"/marks",teacher,stroke,200).path("id").asText();
        String studentMark=request("POST",board+"/marks",first,Map.of("slideId",slide,"tool","text","color","#004c45",
            "points",List.of(point),"label","Practice this"),200).path("id").asText();
        var page=request("GET",board+"?slideId="+slide,second,null,200);
        assertThat(page.path("marks").size()).isEqualTo(2);
        assertThat(page.path("marks").get(0).path("authorId").asText()).isNotEqualTo(page.path("marks").get(1).path("authorId").asText());
        assertThat(page.path("marks").get(1).path("label").asText()).isEqualTo("Practice this");
        assertThat(request("GET",board,second,null,200).path("marks").size()).isZero();
        assertThat(request("GET",board+"?slideId="+slide+"&revision="+page.path("revision").asLong(),second,null,200).path("unchanged").asBoolean()).isTrue();
        request("DELETE",board+"/marks/"+teacherMark,first,null,404);
        request("DELETE",board+"/marks/"+studentMark,first,null,200);
        assertThat(request("GET",board+"?slideId="+slide,teacher,null,200).path("marks").size()).isEqualTo(1);
        var rectangle=Map.of("slideId",slide,"tool","rectangle","color","#004c45",
            "points",List.of(point,Map.of("x",0.5,"y",0.7)),"label","","strokeStyle","dashed","strokeWidth",8);
        String shape=request("POST",board+"/marks",first,rectangle,200).path("id").asText();
        request("POST",board+"/marks",first,Map.of("slideId",slide,"tool","rectangle","color","#004c45","points",List.of(point),"label",""),400);
        var savedShape=request("GET",board+"?slideId="+slide,second,null,200).path("marks").get(1);
        assertThat(savedShape.path("tool").asText()).isEqualTo("rectangle");
        assertThat(savedShape.path("strokeStyle").asText()).isEqualTo("dashed");
        assertThat(savedShape.path("strokeWidth").asInt()).isEqualTo(8);
        request("POST",board+"/erasures",first,Map.of("slideId",slide,"markIds",List.of(shape,teacherMark),
            "points",List.of(point,Map.of("x",0.3,"y",0.4)),"radius",18),200);
        request("POST",board+"/erasures",first,Map.of("slideId",slide,"markIds",List.of(shape),"points",List.of(point),"radius",31),400);
        var partiallyErased=request("GET",board+"?slideId="+slide,second,null,200);
        assertThat(partiallyErased.path("marks").size()).isEqualTo(2);
        assertThat(partiallyErased.path("erasures").size()).isEqualTo(1);
        assertThat(partiallyErased.path("erasures").get(0).path("markId").asText()).isEqualTo(shape);
        assertThat(partiallyErased.path("erasures").get(0).path("radius").asInt()).isEqualTo(18);
        request("DELETE",board+"/marks/"+shape,first,null,200);
        assertThat(request("GET",board+"?slideId="+slide,teacher,null,200).path("marks").size()).isEqualTo(1);
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
