package db.migration;

import java.util.*;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/** Replace auto-named H2/PostgreSQL checks without rebuilding or deleting payment records. */
public class V4__paypal_currency extends BaseJavaMigration {
    @Override public void migrate(Context context) throws Exception {
        var connection=context.getConnection();
        var checks=new ArrayList<String>();
        try(var statement=connection.createStatement(); var rows=statement.executeQuery(
            "SELECT t.constraint_name,c.check_clause FROM information_schema.table_constraints t JOIN information_schema.check_constraints c ON c.constraint_catalog=t.constraint_catalog AND c.constraint_schema=t.constraint_schema AND c.constraint_name=t.constraint_name WHERE LOWER(t.table_name)='checkout_payment' AND t.constraint_schema=CURRENT_SCHEMA() AND t.constraint_type='CHECK'")) {
            while(rows.next()) {
                String clause=rows.getString(2).toLowerCase(Locale.ROOT);
                if(clause.contains("provider") || clause.contains("currency")) checks.add(rows.getString(1));
            }
        }
        if(checks.size()!=2) throw new IllegalStateException("Expected payment provider and currency constraints before PayPal migration");
        try(var statement=connection.createStatement()) {
            for(String name:checks) statement.execute("ALTER TABLE checkout_payment DROP CONSTRAINT \""+name.replace("\"","\"\"")+"\"");
            statement.execute("ALTER TABLE checkout_payment ADD CONSTRAINT checkout_payment_provider_currency CHECK ((provider IN ('esewa','khalti') AND currency='NPR') OR (provider='paypal' AND currency='USD'))");
        }
    }
}
