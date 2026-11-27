package local.phoneassistant.notes;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;

public final class MainActivity extends Activity implements RecognitionListener {
    private static final int REQUEST_MIC = 1;
    private EditText draft;
    private TextView status;
    private Button microphone;
    private LinearLayout history;
    private SharedPreferences storage;
    private SpeechRecognizer recognizer;
    private JSONArray notes;
    private boolean listening;
    private boolean processing;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        storage = getSharedPreferences("local_notes", MODE_PRIVATE);
        try {
            notes = new JSONArray(storage.getString("notes", "[]"));
        } catch (JSONException invalidNotes) {
            new AlertDialog.Builder(this).setMessage("Impossible de lire les notes enregistrées.")
                .setPositiveButton("Fermer", (dialog, option) -> finish()).show();
            return;
        }

        ScrollView scroll = new ScrollView(this);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(Color.rgb(248, 248, 244));
        scroll.addView(page);
        page.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
            view.setPadding(bars.left + dp(20), bars.top + dp(24), bars.right + dp(20), bars.bottom + dp(20));
            return insets;
        });
        setContentView(scroll);
        page.addView(label("Notes vocales", 29));
        page.addView(label("Dictée en français · Stockage sur cet appareil", 15));
        status = label("Prêt à dicter.", 15);
        status.setAccessibilityLiveRegion(TextView.ACCESSIBILITY_LIVE_REGION_POLITE);
        page.addView(status);
        microphone = button("Dicter en français", () -> {
            if (listening) {
                endListening();
            } else if (!processing) {
                requestDictation();
            }
        });
        page.addView(microphone);
        page.addView(button("Installer le modèle français", this::downloadModel));
        draft = new EditText(this);
        draft.setId(100);
        draft.setHint("Texte à modifier avant enregistrement");
        draft.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        draft.setMinLines(3);
        page.addView(draft);
        page.addView(button("Enregistrer la note", this::saveDraft));
        page.addView(label("Notes enregistrées", 22));
        history = new LinearLayout(this);
        history.setOrientation(LinearLayout.VERTICAL);
        page.addView(history);
        showNotes();
    }

    private void requestDictation() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_MIC);
            return;
        }
        if (!prepareRecognizer()) return;
        listening = true;
        microphone.setText("Arrêter la dictée");
        status.setText("Démarrage du micro…");
        recognizer.startListening(frenchIntent());
    }

    private boolean prepareRecognizer() {
        if (recognizer != null) return true;
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) {
            status.setText("La reconnaissance vocale sur l’appareil est indisponible.");
            return false;
        }
        recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
        recognizer.setRecognitionListener(this);
        return true;
    }

    private Intent frenchIntent() {
        return new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR")
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
    }

    private void downloadModel() {
        if (listening || processing || !prepareRecognizer()) return;
        status.setText("Demande d’installation du modèle envoyée à Android.");
        recognizer.triggerModelDownload(frenchIntent());
    }

    private void endListening() {
        listening = false;
        processing = true;
        microphone.setEnabled(false);
        status.setText("Transcription en cours…");
        recognizer.stopListening();
    }

    private void resetMicrophone() {
        listening = false;
        processing = false;
        microphone.setText("Dicter en français");
        microphone.setEnabled(true);
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request != REQUEST_MIC) return;
        if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) requestDictation();
        else status.setText("L’accès au micro est nécessaire pour dicter.");
    }

    @Override public void onResults(Bundle results) {
        resetMicrophone();
        ArrayList<String> choices = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (choices == null || choices.isEmpty() || choices.get(0).isBlank()) {
            status.setText("Aucun texte détecté.");
            return;
        }
        if (draft.length() > 0) draft.append("\n");
        draft.append(choices.get(0));
        status.setText("Texte prêt à relire.");
    }

    @Override public void onError(int error) {
        resetMicrophone();
        if (error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE || error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED) {
            status.setText("Modèle français indisponible. Essayez de l’installer.");
        } else if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
            status.setText("Aucune parole reconnue. Réessayez.");
        } else {
            status.setText("La dictée n’a pas abouti (" + error + "). Réessayez.");
        }
    }

    @Override public void onReadyForSpeech(Bundle params) { status.setText("Parlez en français."); }
    @Override public void onBeginningOfSpeech() { }
    @Override public void onRmsChanged(float rms) { }
    @Override public void onBufferReceived(byte[] buffer) { }
    @Override public void onEndOfSpeech() {
        listening = false;
        processing = true;
        microphone.setEnabled(false);
        status.setText("Transcription en cours…");
    }
    @Override public void onPartialResults(Bundle partial) { }
    @Override public void onEvent(int type, Bundle params) { }

    @Override protected void onStop() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
            resetMicrophone();
            if (status != null) status.setText("Prêt à dicter.");
        }
        super.onStop();
    }

    private void saveDraft() {
        String text = draft.getText().toString().strip();
        if (text.isEmpty()) {
            status.setText("Ajoutez du texte avant d’enregistrer.");
            return;
        }
        JSONArray next = new JSONArray().put(text);
        for (int i = 0; i < notes.length(); i++) next.put(notes.optString(i));
        if (store(next)) {
            draft.setText("");
            status.setText("Note enregistrée localement.");
        }
    }

    private boolean store(JSONArray next) {
        if (!storage.edit().putString("notes", next.toString()).commit()) {
            status.setText("Impossible d’enregistrer la modification.");
            return false;
        }
        notes = next;
        showNotes();
        return true;
    }

    private void showNotes() {
        history.removeAllViews();
        if (notes.length() == 0) history.addView(label("Aucune note.", 15));
        for (int i = 0; i < notes.length(); i++) {
            int index = i;
            TextView note = label(notes.optString(i), 17);
            note.setTextIsSelectable(true);
            history.addView(note);
            history.addView(button("Supprimer cette note", () -> new AlertDialog.Builder(this)
                .setMessage("Supprimer cette note de cet appareil ?")
                .setNegativeButton("Annuler", null)
                .setPositiveButton("Supprimer", (dialog, option) -> {
                    JSONArray next = new JSONArray();
                    for (int j = 0; j < notes.length(); j++) {
                        if (j != index) next.put(notes.optString(j));
                    }
                    if (store(next)) status.setText("Note supprimée.");
                }).show()));
        }
    }

    private TextView label(String text, int size) {
        TextView label = new TextView(this);
        label.setText(text);
        label.setTextColor(Color.rgb(28, 36, 32));
        label.setTextSize(size);
        label.setPadding(0, dp(8), 0, dp(8));
        return label;
    }

    private Button button(String text, Runnable action) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(text);
        button.setOnClickListener(view -> action.run());
        return button;
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
