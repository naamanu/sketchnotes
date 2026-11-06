package dev.nana.sketchnotes;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.recognition.Ink;
import com.google.mlkit.vision.digitalink.common.RecognitionCandidate;
import com.google.mlkit.vision.digitalink.recognition.RecognitionContext;
import com.google.mlkit.vision.digitalink.recognition.WritingArea;
import org.json.JSONArray;

/** On-device handwriting recognition via ML Kit Digital Ink. */
@CapacitorPlugin(name = "Ink")
public class InkPlugin extends Plugin {
    private DigitalInkRecognizer recognizer;
    private String recognizerLang;

    private DigitalInkRecognitionModel model(String lang) throws Exception {
        DigitalInkRecognitionModelIdentifier id = DigitalInkRecognitionModelIdentifier.fromLanguageTag(lang);
        if (id == null) throw new Exception("Unsupported language: " + lang);
        return DigitalInkRecognitionModel.builder(id).build();
    }

    /** Downloads the language model if needed (one-time, needs internet). */
    @PluginMethod
    public void prepare(PluginCall call) {
        String lang = call.getString("lang", "en-US");
        try {
            DigitalInkRecognitionModel m = model(lang);
            RemoteModelManager mgr = RemoteModelManager.getInstance();
            mgr.isModelDownloaded(m).addOnSuccessListener(done -> {
                if (done) { ready(call, lang, m); return; }
                mgr.download(m, new DownloadConditions.Builder().build())
                    .addOnSuccessListener(v -> ready(call, lang, m))
                    .addOnFailureListener(e -> call.reject("Model download failed: " + e.getMessage()));
            }).addOnFailureListener(e -> call.reject(e.getMessage()));
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    private void ready(PluginCall call, String lang, DigitalInkRecognitionModel m) {
        if (recognizer == null || !lang.equals(recognizerLang)) {
            if (recognizer != null) recognizer.close();
            recognizer = DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(m).build());
            recognizerLang = lang;
        }
        JSObject r = new JSObject();
        r.put("ready", true);
        call.resolve(r);
    }

    /** strokes: [[[x, y, t?], ...], ...]; optional width/height/preContext. */
    @PluginMethod
    public void recognize(PluginCall call) {
        if (recognizer == null) { call.reject("Call prepare() first"); return; }
        try {
            JSArray strokes = call.getArray("strokes");
            Ink.Builder ink = Ink.builder();
            for (int i = 0; i < strokes.length(); i++) {
                JSONArray pts = strokes.getJSONArray(i);
                Ink.Stroke.Builder sb = Ink.Stroke.builder();
                for (int j = 0; j < pts.length(); j++) {
                    JSONArray p = pts.getJSONArray(j);
                    float x = (float) p.getDouble(0), y = (float) p.getDouble(1);
                    sb.addPoint(p.length() > 2 ? Ink.Point.create(x, y, p.getLong(2)) : Ink.Point.create(x, y));
                }
                ink.addStroke(sb.build());
            }
            RecognitionContext.Builder ctx = RecognitionContext.builder()
                .setPreContext(call.getString("preContext", ""));
            Double w = call.getDouble("width"), h = call.getDouble("height");
            if (w != null && h != null && w > 0 && h > 0) ctx.setWritingArea(new WritingArea(w.floatValue(), h.floatValue()));
            recognizer.recognize(ink.build(), ctx.build()).addOnSuccessListener(result -> {
                JSArray out = new JSArray();
                for (RecognitionCandidate c : result.getCandidates()) out.put(c.getText());
                JSObject r = new JSObject();
                r.put("candidates", out);
                call.resolve(r);
            }).addOnFailureListener(e -> call.reject(e.getMessage()));
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
