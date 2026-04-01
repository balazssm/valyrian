# Valyrian Backend — Telepítési útmutató

## Fájlstruktúra
```
valyrian-backend/
├── server.js
├── .env
├── models/User.js
├── middleware/auth.js
├── routes/
│   ├── auth.js
│   ├── user.js
│   └── minecraft.js
└── public/
    └── index.html   ← a frontend
```

## Helyi futtatás

```bash
npm install
node server.js
```

Majd nyisd meg: http://localhost:3000

---

## Railway hosztolás (ingyenes, ajánlott)

1. Menj ide: https://railway.app → Sign up (GitHub-bal)
2. "New Project" → "Deploy from GitHub repo"
   - Töltsd fel a mappát GitHub-ra először, vagy:
   - "Empty Project" → "Add Service" → "Node.js"
3. A projekt beállításainál add hozzá a **Variables**-t:
   ```
   MONGO_URI = mongodb+srv://frost:frost123_valyrian@frost.srkfv2d.mongodb.net/valyrian?appName=frost
   JWT_SECRET = valyrian_super_secret_jwt_2026_valami_hosszu_random_string
   PLUGIN_SECRET = valyrian_plugin_secret_2026
   PORT = 3000
   ```
4. Deploy — Railway ad egy URL-t, pl: `https://valyrian-backend.up.railway.app`
5. Az `index.html`-ben a `var API = '...'` sort cseréld erre a URL-re + `/api`

---

## Minecraft Plugin integráció

A plugin a következő HTTP kéréseket küldheti a backendnek.
Minden kérésnél kell a header: `x-plugin-key: [PLUGIN_SECRET értéke]`

### Statisztika frissítés (pl. halál, ölés után)
```
POST /api/mc/stats
{
  "username": "Notch",
  "kills": 42,
  "deaths": 10,
  "wins": 5,
  "playtime": 360,
  "coins": 1200
}
```

### Rang szinkronizálás (pl. LuckPerms group change után)
```
POST /api/mc/rank
{
  "username": "Notch",
  "rank": "vip"
}
```
Értékek: `owner`, `admin`, `mod`, `dev`, `vip`, `player`

### Whitelist státusz változás
```
POST /api/mc/whitelist
{
  "username": "Notch",
  "status": "approved"
}
```

### Aktivitás log bejegyzés
```
POST /api/mc/activity
{
  "username": "Notch",
  "icon": "⚔",
  "text": "<strong>Notch</strong> megnyerte a Practice arénát"
}
```

### Ranglista lekérdezés
```
GET /api/mc/leaderboard?type=kills&limit=10
```

---

## Plugin Java kód példa (HTTP hívás)

```java
import java.net.http.*;
import java.net.URI;

public class ValyrianAPI {
    private static final String BASE = "https://a-te-app.railway.app/api";
    private static final String KEY  = "valyrian_plugin_secret_2026";

    public static void updateStats(String username, int kills, int deaths) {
        String body = String.format(
            "{\"username\":\"%s\",\"kills\":%d,\"deaths\":%d}",
            username, kills, deaths
        );
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest req = HttpRequest.newBuilder()
            .uri(URI.create(BASE + "/mc/stats"))
            .header("Content-Type", "application/json")
            .header("x-plugin-key", KEY)
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        client.sendAsync(req, HttpResponse.BodyHandlers.ofString());
    }

    public static void syncRank(String username, String rank) {
        String body = String.format("{\"username\":\"%s\",\"rank\":\"%s\"}", username, rank);
        // ... ugyanúgy mint fent, de /mc/rank endpoint
    }
}
```

---

## Rangok és megfelelőjük

| Website rang | Minecraft / LuckPerms csoport |
|-------------|-------------------------------|
| owner       | owner                         |
| admin       | admin                         |
| mod         | mod / moderator               |
| dev         | dev / developer               |
| vip         | vip / donor                   |
| player      | default / player              |
