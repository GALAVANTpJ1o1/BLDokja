package com.letterpairtrainer;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final String baseUrl = trimTrailingSlash(BuildConfig.BASE_URL);
    private String currentPair = "";

    private TextView pairView;
    private TextView statusView;
    private TextView revealView;
    private TextView databaseView;
    private EditText practiceWordInput;
    private EditText addPairInput;
    private EditText addWordInput;
    private Button nextButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildLayout();
        loadRandomPair();
        loadWords();
    }

    private void buildLayout() {
        ScrollView scrollView = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(18), dp(16), dp(28));
        root.setBackgroundColor(0xfff5f7f4);
        scrollView.addView(root);

        TextView title = text("Letter Pair Trainer", 28, 0xff17211f, true);
        root.addView(title);
        root.addView(text("Practice", 13, 0xff0b5f59, true));

        pairView = text("--", 86, 0xff0b5f59, true);
        pairView.setGravity(Gravity.CENTER);
        pairView.setBackgroundColor(0xffffffff);
        root.addView(pairView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(180)
        ));

        practiceWordInput = input("Mnemonic word");
        root.addView(practiceWordInput);

        Button saveButton = button("Save and Next");
        saveButton.setOnClickListener(v -> savePracticeWord());
        root.addView(saveButton);

        Button revealButton = secondaryButton("Reveal Common Word");
        revealButton.setOnClickListener(v -> revealCommonWord());
        root.addView(revealButton);

        nextButton = secondaryButton("Next");
        nextButton.setVisibility(View.GONE);
        nextButton.setOnClickListener(v -> loadRandomPair());
        root.addView(nextButton);

        revealView = text("", 18, 0xff17211f, true);
        root.addView(revealView);

        root.addView(sectionTitle("Add Word"));
        addPairInput = input("Letter pair, e.g. AB");
        addPairInput.setAllCaps(true);
        root.addView(addPairInput);

        addWordInput = input("Word");
        root.addView(addWordInput);

        Button addButton = button("Add Word");
        addButton.setOnClickListener(v -> addWord());
        root.addView(addButton);

        root.addView(sectionTitle("Database"));
        Button refreshButton = secondaryButton("Refresh");
        refreshButton.setOnClickListener(v -> loadWords());
        root.addView(refreshButton);

        databaseView = text("Loading...", 15, 0xff17211f, false);
        root.addView(databaseView);

        statusView = text("", 14, 0xff61716d, true);
        root.addView(statusView);

        setContentView(scrollView);
    }

    private void loadRandomPair() {
        status("Loading next pair...");
        get("/api/pairs/random", result -> {
            currentPair = result.getString("pair");
            pairView.setText(currentPair);
            practiceWordInput.setText("");
            revealView.setText("");
            nextButton.setVisibility(View.GONE);
            status("");
        });
    }

    private void savePracticeWord() {
        String word = practiceWordInput.getText().toString().trim();
        if (word.isEmpty()) {
            status("Enter a word before saving.");
            return;
        }
        post("/api/words", "{\"pair\":\"" + escape(currentPair) + "\",\"word\":\"" + escape(word) + "\"}", result -> {
            JSONObject saved = result.getJSONObject("word");
            status("Saved " + saved.getString("pair") + " -> " + saved.getString("word") + ".");
            loadRandomPair();
            loadWords();
        });
    }

    private void revealCommonWord() {
        if (currentPair.isEmpty()) {
            return;
        }
        get("/api/pairs/" + currentPair + "/words", result -> {
            JSONObject top = result.optJSONObject("top_word");
            if (top == null) {
                revealView.setText("No word saved for " + currentPair + " yet.");
            } else {
                revealView.setText(currentPair + " -> " + top.getString("word") + " (" + top.getInt("count") + " uses)");
            }
            nextButton.setVisibility(View.VISIBLE);
            status("");
        });
    }

    private void addWord() {
        String pair = addPairInput.getText().toString().trim().toUpperCase();
        String word = addWordInput.getText().toString().trim();
        if (pair.length() != 2 || word.isEmpty()) {
            status("Enter a two-letter pair and a word.");
            return;
        }
        post("/api/words", "{\"pair\":\"" + escape(pair) + "\",\"word\":\"" + escape(word) + "\"}", result -> {
            JSONObject saved = result.getJSONObject("word");
            status("Added " + saved.getString("pair") + " -> " + saved.getString("word") + ".");
            addPairInput.setText("");
            addWordInput.setText("");
            loadWords();
        });
    }

    private void loadWords() {
        get("/api/words", result -> {
            JSONArray words = result.getJSONArray("words");
            StringBuilder builder = new StringBuilder();
            int limit = Math.min(words.length(), 80);
            for (int i = 0; i < limit; i += 1) {
                JSONObject item = words.getJSONObject(i);
                builder.append(item.getString("pair"))
                        .append("  ")
                        .append(item.getString("word"))
                        .append("  ")
                        .append(item.getInt("count"))
                        .append('\n');
            }
            if (words.length() > limit) {
                builder.append("\nShowing ").append(limit).append(" of ").append(words.length()).append(" words.");
            }
            databaseView.setText(builder.toString());
        });
    }

    private void get(String path, JsonCallback callback) {
        request("GET", path, null, callback);
    }

    private void post(String path, String body, JsonCallback callback) {
        request("POST", path, body, callback);
    }

    private void request(String method, String path, String body, JsonCallback callback) {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(baseUrl + path);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod(method);
                connection.setRequestProperty("Accept", "application/json");
                if (!BuildConfig.API_TOKEN.isEmpty()) {
                    connection.setRequestProperty("Authorization", "Bearer " + BuildConfig.API_TOKEN);
                }
                if (body != null) {
                    connection.setRequestProperty("Content-Type", "application/json");
                    connection.setDoOutput(true);
                    try (OutputStream stream = connection.getOutputStream()) {
                        stream.write(body.getBytes(StandardCharsets.UTF_8));
                    }
                }

                int code = connection.getResponseCode();
                InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
                String text = readAll(stream);
                JSONObject json = new JSONObject(text);
                if (code >= 400) {
                    throw new Exception(json.optString("error", "Request failed."));
                }
                mainHandler.post(() -> {
                    try {
                        callback.onJson(json);
                    } catch (Exception error) {
                        status(error.getMessage());
                    }
                });
            } catch (Exception error) {
                mainHandler.post(() -> status(error.getMessage()));
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }).start();
    }

    private String readAll(InputStream stream) throws Exception {
        if (stream == null) {
            return "{}";
        }
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private void status(String message) {
        statusView.setText(message == null ? "" : message);
    }

    private TextView sectionTitle(String value) {
        TextView view = text(value, 20, 0xff17211f, true);
        view.setPadding(0, dp(22), 0, dp(8));
        return view;
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setPadding(0, dp(8), 0, dp(8));
        if (bold) {
            view.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        }
        return view;
    }

    private EditText input(String hint) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setSingleLine(true);
        input.setTextColor(0xff17211f);
        input.setHintTextColor(0xff61716d);
        input.setPadding(dp(12), dp(8), dp(12), dp(8));
        return input;
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(0xffffffff);
        button.setBackgroundColor(0xff0f766e);
        return button;
    }

    private Button secondaryButton(String label) {
        Button button = button(label);
        button.setTextColor(0xff17211f);
        button.setBackgroundColor(0xffffffff);
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String trimTrailingSlash(String value) {
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private interface JsonCallback {
        void onJson(JSONObject result) throws Exception;
    }
}
