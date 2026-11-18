package com.sikai;

import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.*;

/** All inbox and read-state queries are scoped to the authenticated account. */
@RestController
@RequestMapping("/api/me/notifications")
public class NotificationController {
    private final Db db;
    public NotificationController(Db db) { this.db=db; }
    @GetMapping public Object list(@AuthenticationPrincipal AuthService.User user,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        Db.require(page>=0 && page<=100000 && size>=1 && size<=50,BAD_REQUEST,"page must be 0..100000; size 1..50");
        var items=db.list("SELECT id,type,title,body,target,created_at AS \"createdAt\",read_at AS \"readAt\" FROM app_notification WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",user.id(),size,page*size);
        long total=((Number)db.one("SELECT COUNT(*) AS total FROM app_notification WHERE user_id=?",user.id()).get("total")).longValue();
        return Map.of("items",items,"unreadCount",unread(user.id()),"total",total,"hasMore",(long)page*size+items.size()<total);
    }
    @PutMapping("/{id}/read") @Transactional
    public Object read(@PathVariable String id,@AuthenticationPrincipal AuthService.User user) {
        Db.require(db.update("UPDATE app_notification SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?",System.currentTimeMillis(),id,user.id())>0,NOT_FOUND,"Notification not found");
        return Map.of("unreadCount",unread(user.id()));
    }
    @PostMapping("/read-all") @Transactional
    public Object readAll(@AuthenticationPrincipal AuthService.User user) {
        db.update("UPDATE app_notification SET read_at=? WHERE user_id=? AND read_at IS NULL",System.currentTimeMillis(),user.id());
        return Map.of("unreadCount",unread(user.id()));
    }
    private long unread(String userId) { return ((Number)db.one("SELECT COUNT(*) AS total FROM app_notification WHERE user_id=? AND read_at IS NULL",userId).get("total")).longValue(); }
}
