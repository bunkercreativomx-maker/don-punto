// Don Punto: crear subscription al registrar un usuario nuevo
onRecordAfterCreateSuccess((e) => {
    try {
        const user = e.record;
        const isTest = ["pakovipteam@gmail.com", "tgudino@me.com"].includes(user.email);
        const col = $app.findCollectionByNameOrId("subscriptions");
        const rec = new Record(col);
        rec.set("owner", user.id);
        rec.set("status", isTest ? "active" : "inactive");
        $app.save(rec);
        console.log("[donpunto] subscription creada:", user.email, "->", isTest ? "active" : "inactive");
    } catch (err) {
        console.error("[donpunto] error creando subscription:", err);
    }
}, "users");
