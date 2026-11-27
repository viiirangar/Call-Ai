package be.callai.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.WindowInsets;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.ArrayAdapter;
import android.widget.AdapterView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

public final class MainActivity extends Activity {
    private static final int INK = 0xff192649;
    private static final int MUTED = 0xff4c5b78;
    private static final int BLUE = 0xff294a88;
    private static final int PAPER = 0xfff2f5fa;
    private static final int WHITE = 0xffffffff;
    private static final int MIC = 21;
    private static final int PDF = 22;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LinearLayout root;
    private TextView status;
    private EditText message;
    private Button microphone;
    private LinearLayout messages;
    private ScrollView chatScroll;
    private LinearLayout library;
    private EditText search;
    private Button nextPage;
    private ApiClient api;
    private JSONObject assistant;
    private boolean busy;
    private boolean hasMessages;
    private String page = "";
    private String draft = "";
    private String activeQuery = "";
    private int offset;
    private MediaRecorder recording;
    private File audioFile;
    private Runnable recordingTimeout;
    private TextToSpeech speech;
    private boolean speechReady;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        speech = new TextToSpeech(this, value -> speechReady = value == TextToSpeech.SUCCESS);
        login();
    }

    private void login() {
        api = null;
        assistant = null;
        draft = "";
        page = "login";
        frame("Call-Ai", "Assistant personnel");
        LinearLayout fields = stack();
        ScrollView scroll = scroll(fields);
        root.addView(scroll, weighted());
        fields.addView(label("Connexion au serveur", 25, INK, true));
        EditText address = field(fields, "Adresse HTTPS", "https://assistant.example", 300,
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setText(getPreferences(MODE_PRIVATE).getString("origin", ""));
        EditText password = field(fields, "Mot de passe", "Votre mot de passe", 1024,
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        fields.addView(button("Se connecter", true, () -> {
            ApiClient candidate;
            try { candidate = new ApiClient(address.getText().toString()); }
            catch (IllegalArgumentException error) { status.setText(error.getMessage()); return; }
            String value = password.getText().toString();
            if (value.isEmpty()) { status.setText("Saisissez votre mot de passe."); return; }
            password.setText("");
            perform("Connexion…", () -> {
                candidate.json("POST", "/api/session", object("password", value));
                return new JSONObject(candidate.get("/api/assistant"));
            }, result -> {
                api = candidate;
                assistant = result;
                getPreferences(MODE_PRIVATE).edit().putString("origin", candidate.origin).apply();
                ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(password.getWindowToken(), 0);
                showChat();
            });
        }));
        addStatus(fields);
    }

    private void frame(String title, String subtitle) {
        root = stack();
        root.setBackgroundColor(PAPER);
        setContentView(root);
        int lightBars = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        if (getWindow().getInsetsController() != null) getWindow().getInsetsController().setSystemBarsAppearance(lightBars, lightBars);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            var bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
            view.setPadding(bars.left + dp(18), bars.top + dp(8), bars.right + dp(18), bars.bottom + dp(8));
            return insets;
        });
        root.requestApplyInsets();
        root.addView(label(title, 28, INK, true));
        root.addView(label(subtitle, 14, MUTED, false));
    }

    private void navigation() {
        LinearLayout nav = row();
        nav.addView(button("Assistant", page.equals("chat"), this::openChat), equal());
        nav.addView(button("Mémoire", page.equals("memory"), this::openMemory), equal());
        nav.addView(button("Réglages", page.equals("settings"), this::showSettings), equal());
        root.addView(nav);
    }

    private void leaveChat() {
        if (page.equals("chat") && message != null) draft = message.getText().toString();
        stopRecording(false);
    }

    private void openChat() {
        if (page.equals("chat")) return;
        perform("Chargement…", () -> new JSONObject(api.get("/api/assistant")), data -> {
            assistant = data;
            showChat();
        });
    }

    private void showChat() {
        page = "chat";
        frame("Call-Ai", assistant.optBoolean("chat") ? "Assistant personnel" : "Configurez votre modèle dans Réglages");
        navigation();
        messages = stack();
        chatScroll = scroll(messages);
        root.addView(chatScroll, weighted());
        JSONArray history = assistant.optJSONArray("messages");
        if (history != null) {
            for (int i = 0; i < history.length(); i++) {
                JSONObject entry = history.optJSONObject(i);
                if (entry != null) addMessage(entry.optString("role"), entry.optString("text"));
            }
        }
        hasMessages = messages.getChildCount() > 0;
        if (!hasMessages) {
            messages.addView(label("Comment puis-je vous aider ?", 25, INK, true));
            messages.addView(label("Écrivez un message ou dictez-le. Vos notes et PDF sont disponibles dans Mémoire.", 15, MUTED, false));
        }
        message = field(root, "Votre message", "Écrivez à votre assistant…", 4000,
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        message.setMaxLines(4);
        message.setText(draft);
        LinearLayout actions = row();
        microphone = button("Micro", false, this::tapMicrophone);
        actions.addView(microphone, equal());
        actions.addView(button("Envoyer", true, this::sendMessage), equal());
        root.addView(actions);
        addStatus(root);
        scrollChat();
    }

    private void addMessage(String role, String text) {
        boolean user = role.equals("user");
        LinearLayout card = stack();
        card.setPadding(dp(12), dp(8), dp(12), dp(8));
        card.setBackground(background(user ? 0xffe0e9fc : WHITE));
        card.addView(label(user ? "Vous" : "Assistant", 13, BLUE, true));
        TextView body = label(text, 17, INK, false);
        body.setTextIsSelectable(true);
        card.addView(body);
        if (!user) card.addView(button("Écouter en français", false, () -> speak(text)));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
        layout.gravity = user ? Gravity.END : Gravity.START;
        layout.setMargins(user ? dp(24) : 0, dp(5), user ? 0 : dp(24), dp(5));
        messages.addView(card, layout);
    }

    private void scrollChat() { chatScroll.post(() -> chatScroll.fullScroll(ScrollView.FOCUS_DOWN)); }

    private void sendMessage() {
        String sentDraft = message.getText().toString();
        String text = sentDraft.trim();
        if (text.isEmpty()) { status.setText("Écrivez ou dictez un message."); return; }
        if (recording != null) { status.setText("Arrêtez le micro avant d’envoyer."); return; }
        perform("Réponse en cours…", () -> new JSONObject(api.json("POST", "/api/assistant/chat", object("text", text))), result -> {
            JSONObject answer = result.optJSONObject("reply");
            if (answer == null) { status.setText("Réponse illisible."); return; }
            if (!hasMessages) messages.removeAllViews();
            hasMessages = true;
            addMessage("user", text);
            addMessage("assistant", answer.optString("text"));
            if (message.getText().toString().equals(sentDraft)) message.setText("");
            draft = message.getText().toString();
            scrollChat();
        });
    }

    private void tapMicrophone() {
        if (recording != null) { stopRecording(true); return; }
        if (!assistant.optBoolean("voice")) { status.setText("Connectez Whisper sur le serveur pour utiliser le micro."); return; }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC);
            return;
        }
        record();
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request == MIC && page.equals("chat")) {
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) record();
            else status.setText("Autorisez le micro pour dicter.");
        }
    }

    private void record() {
        try {
            audioFile = File.createTempFile("dictation-", ".m4a", getCacheDir());
            recording = new MediaRecorder(this);
            recording.setAudioSource(MediaRecorder.AudioSource.MIC);
            recording.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recording.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recording.setAudioChannels(1);
            recording.setOutputFile(audioFile.getAbsolutePath());
            recording.setOnErrorListener((instance, code, extra) -> {
                if (instance == recording) { stopRecording(false); status.setText("Enregistrement interrompu."); }
            });
            recording.prepare();
            recording.start();
            recordingTimeout = () -> stopRecording(true);
            handler.postDelayed(recordingTimeout, 20_000);
            microphone.setText("Arrêter");
            status.setText("Enregistrement en cours…");
        } catch (Exception error) {
            stopRecording(false);
            status.setText("Impossible d’enregistrer le son.");
        }
    }

    private void stopRecording(boolean transcribe) {
        if (recording == null && audioFile == null) return;
        if (recordingTimeout != null) handler.removeCallbacks(recordingTimeout);
        recordingTimeout = null;
        File file = audioFile;
        audioFile = null;
        MediaRecorder recorder = recording;
        recording = null;
        boolean complete = false;
        if (recorder != null) {
            try { recorder.stop(); complete = true; }
            catch (RuntimeException ignored) { }
            finally { recorder.release(); }
        }
        if (microphone != null) microphone.setText("Micro");
        if (!transcribe || !complete || file == null || file.length() == 0 || busy) {
            if (file != null) file.delete();
            status.setText(transcribe ? "Aucun son utilisable. Réessayez." : "");
            return;
        }
        perform("Transcription…", () -> {
            try (InputStream stream = new FileInputStream(file)) {
                byte[] bytes = ApiClient.readLimited(stream, 8 * 1024 * 1024);
                return new JSONObject(api.request("POST", "/api/assistant/audio", "audio/mp4", bytes)).getString("text");
            } finally { file.delete(); }
        }, text -> {
            if (message.length() > 0) message.append("\n");
            message.append(text);
            status.setText("Relisez le texte puis envoyez votre message.");
        });
    }

    private void speak(String text) {
        if (!speechReady || speech.getVoices() == null) { status.setText("La synthèse vocale n’est pas disponible."); return; }
        Voice voice = speech.getVoices().stream()
            .filter(item -> !item.isNetworkConnectionRequired() && item.getLocale().getLanguage().equals("fr")
                && (item.getFeatures() == null || !item.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)))
            .findFirst().orElse(null);
        if (voice == null || speech.setVoice(voice) != TextToSpeech.SUCCESS) { status.setText("Installez une voix française hors ligne sur le téléphone."); return; }
        int max = TextToSpeech.getMaxSpeechInputLength();
        speech.speak(text.substring(0, Math.min(text.length(), max)), TextToSpeech.QUEUE_FLUSH, null, "reply");
    }

    private void openMemory() {
        if (page.equals("memory")) return;
        leaveChat();
        page = "memory";
        frame("Mémoire", "Documents et notes sur votre serveur");
        navigation();
        LinearLayout actions = row();
        actions.addView(button("Nouvelle note", false, this::newNote), equal());
        actions.addView(button("Importer un PDF", true, this::pickPdf), equal());
        root.addView(actions);
        search = field(root, "Chercher dans la mémoire", "Titre ou texte", 160, InputType.TYPE_CLASS_TEXT);
        root.addView(button("Chercher", false, () -> loadMemory(false)));
        library = stack();
        root.addView(scroll(library), weighted());
        nextPage = button("Afficher la suite", false, () -> loadMemory(true));
        nextPage.setVisibility(Button.GONE);
        root.addView(nextPage);
        addStatus(root);
        loadMemory(false);
    }

    private void loadMemory(boolean append) {
        String query = append ? activeQuery : search.getText().toString().trim();
        int start = append ? offset : 0;
        perform("Recherche…", () -> new JSONArray(api.get("/api/entries?q=" + ApiClient.encode(query) + "&offset=" + start)), rows -> {
            if (!append) library.removeAllViews();
            if (rows.length() == 0 && !append) library.addView(label("Aucun résultat.", 16, MUTED, false));
            for (int i = 0; i < rows.length(); i++) {
                JSONObject entry = rows.optJSONObject(i);
                if (entry == null) continue;
                library.addView(button(entry.optString("title"), false, () -> openEntry(entry.optLong("id"))));
                library.addView(label(entry.optString("excerpt"), 14, MUTED, false));
            }
            activeQuery = query;
            offset = start + rows.length();
            nextPage.setVisibility(rows.length() == 50 ? Button.VISIBLE : Button.GONE);
        });
    }

    private void newNote() {
        LinearLayout form = stack();
        form.setPadding(dp(20), 0, dp(20), 0);
        EditText title = field(form, "Titre", "Titre de la note", 160, InputType.TYPE_CLASS_TEXT);
        EditText body = field(form, "Texte", "Contenu de la note", 500_000, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        body.setMinLines(3);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Nouvelle note").setView(form)
            .setNegativeButton("Annuler", null).setPositiveButton("Enregistrer", null).create();
        dialog.setOnShowListener(view -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button -> {
            String name = title.getText().toString().trim();
            String text = body.getText().toString().trim();
            if (name.isEmpty()) { title.setError("Titre requis"); return; }
            if (text.isEmpty()) { body.setError("Texte requis"); return; }
            perform("Enregistrement…", () -> api.json("POST", "/api/entries", new JSONObject().put("title", name).put("text", text).toString()), result -> {
                dialog.dismiss();
                search.setText("");
                loadMemory(false);
            });
        }));
        dialog.show();
    }

    private void openEntry(long id) {
        perform("Chargement…", () -> new JSONObject(api.get("/api/entries/" + id)), entry -> {
            TextView content = label(entry.optString("text"), 16, INK, false);
            content.setTextIsSelectable(true);
            content.setPadding(dp(20), dp(8), dp(20), dp(12));
            new AlertDialog.Builder(this).setTitle(entry.optString("title")).setView(scroll(content))
                .setPositiveButton("Fermer", null).setNeutralButton("Supprimer", (dialog, option) -> confirmDelete(id)).show();
        });
    }

    private void confirmDelete(long id) {
        new AlertDialog.Builder(this).setMessage("Supprimer ce document de la mémoire ?")
            .setNegativeButton("Annuler", null).setPositiveButton("Supprimer", (dialog, option) ->
                perform("Suppression…", () -> api.request("DELETE", "/api/entries/" + id, null, null), result -> loadMemory(false))).show();
    }

    private void pickPdf() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/pdf");
        try { startActivityForResult(intent, PDF); }
        catch (android.content.ActivityNotFoundException error) { status.setText("Aucun sélecteur de fichiers disponible."); }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PDF || result != RESULT_OK || data == null || data.getData() == null || !page.equals("memory")) return;
        Uri uri = data.getData();
        perform("Extraction du PDF…", () -> {
            String title = pdfTitle(uri);
            try (InputStream stream = getContentResolver().openInputStream(uri)) {
                if (stream == null) throw new IllegalArgumentException("Impossible d’ouvrir le PDF.");
                byte[] contents = ApiClient.readLimited(stream, 10 * 1024 * 1024);
                return api.request("POST", "/api/pdfs?title=" + ApiClient.encode(title), "application/pdf", contents);
            }
        }, value -> { search.setText(""); loadMemory(false); });
    }

    private String pdfTitle(Uri uri) {
        String title = "Document PDF";
        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && cursor.getString(0) != null) {
                String name = cursor.getString(0).replaceFirst("(?i)\\.pdf$", "").trim();
                if (!name.isEmpty()) title = name.substring(0, Math.min(name.length(), 160));
            }
        }
        return title;
    }

    private void showSettings() {
        if (page.equals("settings")) return;
        leaveChat();
        page = "settings";
        frame("Réglages", api.origin);
        navigation();
        LinearLayout settings = stack();
        root.addView(scroll(settings), weighted());
        addStatus(settings);
        LinearLayout providerSection = stack();
        settings.addView(providerSection);
        settings.addView(label("Langue des réponses", 16, INK, true));
        Spinner languages = new Spinner(this);
        String[] codes = {"auto", "fr", "fa"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, new String[]{"Langue du message", "Français", "Persan"});
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        languages.setAdapter(adapter);
        for (int i = 0; i < codes.length; i++) if (codes[i].equals(assistant.optString("language"))) languages.setSelection(i);
        settings.addView(languages);
        settings.addView(button("Enregistrer la langue", true, () -> {
            String code = codes[languages.getSelectedItemPosition()];
            perform("Enregistrement…", () -> api.json("PUT", "/api/assistant/preferences", object("language", code)), result -> {
                try { assistant.put("language", code); } catch (Exception ignored) { }
                status.setText("Langue enregistrée.");
            });
        }));
        settings.addView(label("Whisper · " + (assistant.optBoolean("voice") ? "configuré" : "à connecter"), 16, INK, false));
        settings.addView(label("Appels Proximus · connexion téléphonique en attente", 16, MUTED, false));
        settings.addView(button("Se déconnecter", false, () -> perform("Déconnexion…", () -> api.request("DELETE", "/api/session", null, null), result -> login())));
        loadProvider(providerSection, "");
    }

    private void loadProvider(LinearLayout section, String after) {
        perform("Chargement du modèle…", () -> new JSONObject(api.get("/api/assistant/provider")), configuration -> {
            showProvider(section, configuration);
            if (!after.isEmpty()) status.setText(after);
        });
    }

    private void showProvider(LinearLayout section, JSONObject configuration) {
        section.removeAllViews();
        section.addView(label("Modèle IA · BYOK", 21, INK, true));
        section.addView(label("Vos messages et les extraits utiles de votre mémoire sont transmis au fournisseur sélectionné.", 14, MUTED, false));
        boolean saved = configuration.optBoolean("keyConfigured");
        section.addView(label(saved ? "Clé API enregistrée" : "Aucune clé API enregistrée", 14, BLUE, true));

        Spinner provider = new Spinner(this);
        ArrayAdapter<String> options = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item,
            new String[]{"NVIDIA NIM", "API compatible OpenAI"});
        options.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        provider.setAdapter(options);
        provider.setContentDescription("Fournisseur du modèle");
        section.addView(provider);
        boolean compatible = configuration.optString("provider").equals("compatible");
        provider.setSelection(compatible ? 1 : 0);

        LinearLayout custom = stack();
        EditText baseUrl = field(custom, "Adresse HTTPS de l’API", "https://api.example.com/v1", 500,
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        if (compatible) baseUrl.setText(configuration.optString("baseUrl"));
        custom.setVisibility(compatible ? View.VISIBLE : View.GONE);
        section.addView(custom);
        provider.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                custom.setVisibility(position == 1 ? View.VISIBLE : View.GONE);
            }
            @Override public void onNothingSelected(AdapterView<?> parent) { }
        });

        EditText model = field(section, "Identifiant du modèle", "Nom du modèle chez le fournisseur", 160, InputType.TYPE_CLASS_TEXT);
        model.setText(configuration.optString("model"));
        EditText key = field(section, "Clé API", saved ? "Laissez vide pour garder la clé de cette adresse" : "Collez votre clé API", 2048,
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        key.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        key.setImeOptions(key.getImeOptions() | EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
        section.addView(button("Enregistrer le modèle", true, () -> {
            boolean customProvider = provider.getSelectedItemPosition() == 1;
            String tag = customProvider ? "compatible" : "nvidia";
            String url = customProvider ? baseUrl.getText().toString().trim() : "";
            String identifier = model.getText().toString().trim();
            String secret = key.getText().toString().trim();
            if (identifier.isEmpty()) { model.setError("Identifiant requis"); return; }
            if (customProvider && url.isEmpty()) { baseUrl.setError("Adresse requise"); return; }
            perform("Enregistrement du modèle…", () -> api.json("PUT", "/api/assistant/provider",
                new JSONObject().put("provider", tag).put("model", identifier).put("baseUrl", url).put("apiKey", secret).toString()), result -> {
                    key.setText("");
                    loadProvider(section, "Modèle enregistré.");
                });
        }));
        if (saved) {
            section.addView(button("Tester le modèle enregistré", false, () -> perform("Test du fournisseur…",
                () -> api.request("POST", "/api/assistant/provider/test", null, null), result -> status.setText("Le modèle a répondu."))));
            section.addView(button("Supprimer la clé", false, () -> new AlertDialog.Builder(this)
                .setMessage("Supprimer la clé API enregistrée ?")
                .setNegativeButton("Annuler", null)
                .setPositiveButton("Supprimer", (dialog, option) -> perform("Suppression…",
                    () -> api.request("DELETE", "/api/assistant/provider", null, null), result -> loadProvider(section, "Clé supprimée.")))
                .show()));
        }
    }

    private <T> void perform(String pending, Callable<T> work, Consumer<T> success) {
        if (busy) return;
        busy = true;
        status.setText(pending);
        executor.execute(() -> {
            try {
                T result = work.call();
                handler.post(() -> {
                    if (isDestroyed() || isFinishing()) return;
                    busy = false;
                    status.setText("");
                    success.accept(result);
                });
            } catch (Exception error) {
                handler.post(() -> {
                    if (isDestroyed() || isFinishing()) return;
                    busy = false;
                    if (error instanceof ApiClient.ApiError && ((ApiClient.ApiError) error).status == 401 && api != null) login();
                    status.setText(errorText(error));
                });
            }
        });
    }

    private static String errorText(Exception error) {
        if (error instanceof ApiClient.ApiError) {
            ApiClient.ApiError failure = (ApiClient.ApiError) error;
            try { return new JSONObject(failure.body).getString("error"); }
            catch (Exception ignored) { return "Le serveur a renvoyé une erreur (" + failure.status + ")."; }
        }
        if (error instanceof ApiClient.PayloadTooLarge) return "Le fichier dépasse la taille autorisée.";
        if (error instanceof IllegalArgumentException) return error.getMessage();
        return "Impossible de joindre le serveur HTTPS. Vérifiez l’adresse et la connexion.";
    }

    private static String object(String key, String value) throws Exception { return new JSONObject().put(key, value).toString(); }

    private LinearLayout stack() { LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.VERTICAL); return view; }
    private LinearLayout row() { LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.HORIZONTAL); return view; }
    private LinearLayout.LayoutParams weighted() { return new LinearLayout.LayoutParams(-1, 0, 1); }
    private LinearLayout.LayoutParams equal() { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, -2, 1); p.setMargins(dp(2), 0, dp(2), 0); return p; }
    private ScrollView scroll(android.view.View child) { ScrollView view = new ScrollView(this); view.setFillViewport(false); view.addView(child); return view; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private GradientDrawable background(int color) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(12));
        return shape;
    }

    private TextView label(String text, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setPadding(0, dp(4), 0, dp(4));
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private void addStatus(LinearLayout container) {
        status = label("", 14, MUTED, false);
        status.setAccessibilityLiveRegion(TextView.ACCESSIBILITY_LIVE_REGION_POLITE);
        container.addView(status);
    }

    private EditText field(LinearLayout container, String name, String hint, int max, int type) {
        EditText input = new EditText(this);
        input.setId(android.view.View.generateViewId());
        TextView label = label(name, 14, INK, true);
        label.setLabelFor(input.getId());
        container.addView(label);
        input.setHint(hint);
        input.setTextColor(INK);
        input.setHintTextColor(MUTED);
        input.setInputType(type);
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(max)});
        input.setBackground(background(WHITE));
        input.setPadding(dp(11), dp(8), dp(11), dp(8));
        input.setMinHeight(dp(46));
        container.addView(input, new LinearLayout.LayoutParams(-1, -2));
        return input;
    }

    private Button button(String text, boolean primary, Runnable action) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextColor(primary ? WHITE : BLUE);
        button.setBackgroundTintList(ColorStateList.valueOf(primary ? BLUE : WHITE));
        button.setMinimumHeight(dp(48));
        button.setOnClickListener(view -> { if (!busy) action.run(); });
        return button;
    }

    @Override protected void onStop() {
        stopRecording(false);
        if (speech != null) speech.stop();
        super.onStop();
    }

    @Override protected void onDestroy() {
        executor.shutdown();
        if (speech != null) speech.shutdown();
        super.onDestroy();
    }
}
