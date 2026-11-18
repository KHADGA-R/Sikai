package db.migration;

import java.util.*;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/** Keep receipts and replace the old single-course uniqueness with the basket key added in V5. */
public class V6__multi_course_orders extends BaseJavaMigration {
    @Override public void migrate(Context context) throws Exception {
        var constraints=new LinkedHashMap<String,Set<String>>();
        try(var statement=context.getConnection().createStatement();var rows=statement.executeQuery(
            "SELECT t.constraint_name,k.column_name FROM information_schema.table_constraints t JOIN information_schema.key_column_usage k ON k.constraint_catalog=t.constraint_catalog AND k.constraint_schema=t.constraint_schema AND k.constraint_name=t.constraint_name WHERE LOWER(t.table_name)='checkout_order' AND t.constraint_schema=CURRENT_SCHEMA() AND t.constraint_type='UNIQUE'")) {
            while(rows.next()) constraints.computeIfAbsent(rows.getString(1),key->new HashSet<>()).add(rows.getString(2).toLowerCase(Locale.ROOT));
        }
        var old=constraints.entrySet().stream().filter(e->e.getValue().equals(Set.of("user_id","course_id"))).map(Map.Entry::getKey).toList();
        if(old.size()!=1) throw new IllegalStateException("Expected the legacy single-course order uniqueness constraint");
        try(var statement=context.getConnection().createStatement()) {
            statement.execute("ALTER TABLE checkout_order DROP CONSTRAINT \""+old.get(0).replace("\"","\"\"")+"\"");
        }
    }
}
