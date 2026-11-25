package com.droplibrary.app;

import android.content.Intent;
import android.os.Bundle;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends BridgeActivity {
    private static final String DIRECT_SHARE_CATEGORY = "com.droplibrary.app.category.DIRECT_SHARE";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        publishDirectShareShortcuts();
    }

    /**
     * Publishes Direct Share shortcuts so Drop Library appears in the top-priority
     * Direct Share row of the Android Share Sheet (similar to WhatsApp contacts).
     */
    private void publishDirectShareShortcuts() {
        try {
            Set<String> categories = new HashSet<>(Collections.singletonList(DIRECT_SHARE_CATEGORY));
            IconCompat icon = IconCompat.createWithResource(this, R.mipmap.ic_launcher);

            ShortcutInfoCompat vaultShortcut = new ShortcutInfoCompat.Builder(this, "drop_vault_direct")
                .setShortLabel("Save to Vault")
                .setLongLabel("Drop Library Vault")
                .setIcon(icon)
                .setIntent(new Intent(Intent.ACTION_DEFAULT))
                .setLongLived(true)
                .setCategories(categories)
                .setRank(0)
                .build();

            ShortcutManagerCompat.pushDynamicShortcut(this, vaultShortcut);
        } catch (Exception e) {
            // Non-fatal on older Android versions
        }
    }
}
