package dev.nana.sketchnotes;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(InkPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
