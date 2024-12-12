const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");

const app = express();
const port = 3000;

// ** Conexión a MongoDB **
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// ** Eventos de conexión **
mongoose.connection.on("error", (err) => {
    console.error("Error al conectar a MongoDB:", err);
});

mongoose.connection.once("open", () => {
    console.log("Conectado a MongoDB");
});

// ** Definición del esquema y modelo **
const stockSchema = new mongoose.Schema({
    product: { type: String, required: true },
    quantity: { type: Number, required: true },
});

const Stock = mongoose.model("Stock", stockSchema);

// ** Middleware **
app.use(cors()); // Permitir solicitudes de otros orígenes
app.use(express.json()); // Habilitar procesamiento de JSON

// ** Ruta de verificación del servidor **
app.get("/", (req, res) => {
    res.send("Bienvenido al servidor");
});

// ** Rutas de API **

// Obtener todo el stock
app.get("/api/stock", async (req, res) => {
    try {
        const stock = await Stock.find();
        res.json(stock);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener el stock" });
    }
});

// Agregar, solicitar o devolver stock
app.post("/api/stock", async (req, res) => {
    const { action, product, quantity } = req.body;

    if (!action || !product || typeof quantity !== "number") {
        return res.status(400).json({ message: "Datos incompletos o inválidos" });
    }

    try {
        let stockItem = await Stock.findOne({ product });

        if (!stockItem) {
            stockItem = new Stock({ product, quantity: 0 });
        }

        switch (action) {
            case "add":
                stockItem.quantity += quantity;
                break;
            case "request":
                if (stockItem.quantity >= quantity) {
                    stockItem.quantity -= quantity;
                } else {
                    return res.status(400).json({ message: "Stock insuficiente" });
                }
                break;
            case "return":
                stockItem.quantity += quantity;
                break;
            default:
                return res.status(400).json({ message: "Acción no válida" });
        }

        await stockItem.save();
        res.json(stockItem);
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar el stock" });
    }
});

// Crear un producto
app.post("/api/products", async (req, res) => {
    const { product, quantity } = req.body;

    if (!product || typeof quantity !== "number") {
        return res.status(400).json({ message: "Datos incompletos o inválidos" });
    }

    try {
        const newProduct = new Stock({ product, quantity });
        await newProduct.save();
        res.status(201).json({ message: "Producto creado", data: newProduct });
    } catch (error) {
        res.status(500).json({ message: "Error al crear el producto" });
    }
});

// Actualizar un producto
app.put("/api/products/:id", async (req, res) => {
    const { id } = req.params;
    const { product, quantity } = req.body;

    if (!product || typeof quantity !== "number") {
        return res.status(400).json({ message: "Datos incompletos o inválidos" });
    }

    try {
        const updatedProduct = await Stock.findByIdAndUpdate(
            id,
            { product, quantity },
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({ message: "Producto no encontrado" });
        }

        res.json({ message: "Producto actualizado", data: updatedProduct });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar el producto" });
    }
});

// Eliminar un producto
app.delete("/api/products/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const deletedProduct = await Stock.findByIdAndDelete(id);

        if (!deletedProduct) {
            return res.status(404).json({ message: "Producto no encontrado" });
        }

        res.json({ message: "Producto eliminado", data: deletedProduct });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar el producto" });
    }
});

// ** Middleware de manejo global de errores **
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Error interno del servidor", error: err.message });
});

// ** Iniciar servidor **
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});

//Realizar accion: curl -X POST http://localhost:3000/api/stock -H "Content-Type: application/json" -d "{\"action\": \"add o request o return\", \"product\": \"Producto1\", \"quantity\": 10}"
