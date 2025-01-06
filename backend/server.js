const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const PDFDocument = require("pdfkit");
const fs = require("fs");

const app = express();
const port = 3000;

// ** Frontend ** 
const path = require("path");

// Ruta para servir archivos estáticos desde la carpeta "frontend"
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Ruta para servir el archivo principal "index.html"
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

// ** Conexión a MongoDB **
mongoose.connect(process.env.MONGO_URI)

mongoose.connection.on("error", (err) => {
  console.error("Error al conectar a MongoDB:", err);
});

mongoose.connection.once("open", () => {
  console.log("Conectado a MongoDB");
});

// Esquemas y modelos
const stockSchema = new mongoose.Schema({ 
    product: String, 
    quantity: Number 
});
const Stock = mongoose.model("Stock", stockSchema);

const saleSchema = new mongoose.Schema({
    product: String,
    quantity: Number,
    date: { type: Date, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Campo que hace referencia al usuario
});
const Sale = mongoose.model("Sale", saleSchema);

const saleWeeklySchema = new mongoose.Schema({
    product: String,
    quantity: Number,
    date: { type: Date, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Campo que hace referencia al usuario
});
const SaleWeekly = mongoose.model("SaleWeekly", saleWeeklySchema);

const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    role: { type: String, enum: ["admin", "user"], default: "user" },
});
const User = mongoose.model("User", userSchema);

// Middleware
app.use(cors());
app.use(express.json());

function authorize(roles = []) {
    return (req, res, next) => {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ message: "No autorizado" });

        jwt.verify(token, "secretKey", (err, decoded) => {
            if (err || (roles.length && !roles.includes(decoded.role))) {
                return res.status(403).json({ message: "Acceso denegado" });
            }
            req.user = decoded;
            next();
        });
    };
}

// Rutas de autenticación
app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Credenciales inválidas" });

        const token = jwt.sign({ id: user._id, role: user.role }, "secretKey", { expiresIn: "1h" });
        res.json({ token, role: user.role });
    } catch (err) {
        res.status(500).json({ message: "Error del servidor" });
    }
});

// Ruta para registrar usuarios
app.post("/api/register", authorize(["admin"]), async (req, res) => {
    const { username, password, role } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: "El usuario ya existe" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword, role });
        await newUser.save();

        res.status(201).json({ message: "Usuario registrado con éxito", user: { username, role } });
    } catch (err) {
        res.status(500).json({ message: "Error al registrar el usuario" });
    }
});

// Rutas de stock
app.get("/api/stock", authorize(), async (req, res) => {
    try {
        const stock = await Stock.find();
        res.json(stock);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener el stock" });
    }
});

app.post("/api/stock", authorize(), async (req, res) => {
    const { action, product, quantity } = req.body;
    try {
        let stockItem = await Stock.findOne({ product });

        switch (action) {
            case "add":
                if (!stockItem) {
                    stockItem = new Stock({ product, quantity });
                } else {
                    stockItem.quantity += quantity;
                }
                break;
            case "request":
            case "sale":
                if (!stockItem || stockItem.quantity < quantity) {
                    return res.status(400).json({ message: "Stock insuficiente" });
                }
                stockItem.quantity -= quantity;

                if (action === "sale") {
                    await Sale.create({ product, quantity, userId });
                }
                break;
            case "return":
                if (!stockItem) {
                    stockItem = new Stock({ product, quantity });
                } else {
                    stockItem.quantity += quantity;
                }
                break;
            default:
                return res.status(400).json({ message: "Acción no válida" });
        }

        await stockItem.save();
        res.json({ product: stockItem.product, quantity: stockItem.quantity });
    } catch (err) {
        res.status(500).json({ message: "Error al actualizar el stock" });
    }
});

// Rutas de reportes
app.get("/api/reports/:type", authorize(["admin"]), async (req, res) => {
    const { type } = req.params;

    const generateStockReport = async (doc) => {
        try {
            const stock = await Stock.find();
    
            // Encabezado del reporte
            doc.text("Reporte de Stock", { align: "center", underline: true });
            doc.moveDown();
    
            // Iterar sobre el stock y mostrar los productos y cantidades
            stock.forEach(({ product, quantity }) => {
                doc.text(`${product}: ${quantity} unidades`);
            });
    
            doc.moveDown();
    
            // Obtener la fecha y hora actual en horario de Argentina
            const currentDateTime = new Date().toLocaleString("es-AR", {
                timeZone: "America/Argentina/Buenos_Aires",
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "numeric",
                hour12: true,
            });
    
            // Mensaje al final del reporte
            doc.text(`Reporte de Stock generado el ${currentDateTime}`, {
                align: "center",
                italics: true,
            });
        } catch (error) {
            console.error("Error al generar el reporte de stock:", error);
            doc.text("Error al generar el reporte de stock.");
        }
    };    

    const generateSalesReport = async (doc) => {
        try {
            // Obtener las ventas y poblar el campo 'userId' para obtener la información del usuario
            const sales = await Sale.find().populate("userId", "username"); // 'username' es el campo que queremos del modelo User
    
            doc.text("Reporte de Ventas", { align: "center", underline: true });
            doc.moveDown();
    
            // Verificar si hay ventas
            if (sales.length === 0) {
                doc.text("No hay ventas registradas.");
            } else {
                // Inicializar un objeto para acumular las ventas por usuario
                const userSalesSummary = {};
    
                // Iterar sobre las ventas
                sales.forEach(({ product, quantity, date, userId }) => {
                    const userName = userId ? userId.username : "Usuario desconocido"; // Nombre del usuario
    
                    // Convertir la fecha al horario de Argentina (UTC-3)
                    const formattedDate = new Date(date).toLocaleString("es-AR", { 
                        timeZone: "America/Argentina/Buenos_Aires", 
                        hour12: true, 
                        weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric" 
                    });
    
                    doc.text(`${quantity} ${product}, vendidas el ${formattedDate} por ${userName}`);
    
                    // Acumular las ventas por usuario
                    if (!userSalesSummary[userName]) {
                        userSalesSummary[userName] = { totalSold: 0, products: {} };
                    }
    
                    userSalesSummary[userName].totalSold += quantity;
                    if (!userSalesSummary[userName].products[product]) {
                        userSalesSummary[userName].products[product] = 0;
                    }
                    userSalesSummary[userName].products[product] += quantity;
                });
    
                doc.moveDown();
                doc.text("Resumen por usuario:", { underline: true });
                doc.moveDown();
    
                // Agregar el resumen de ventas por usuario al final
                Object.entries(userSalesSummary).forEach(([userName, { totalSold, products }]) => {
                    const productSummary = Object.entries(products)
                        .map(([product, quantity]) => `${quantity} ${product}`)
                        .join(", ");
                    doc.text(`"${userName}": ${totalSold} productos vendidos (${productSummary})`);
                });
            }
        } catch (err) {
            console.error("Error al generar el reporte de ventas:", err);
            doc.text("Error al generar el reporte de ventas.");
        }
    };
    
    const generateWeeklyReport = async (doc) => {
        try {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
            // Obtener todas las ventas semanales de la tabla "SaleWeekly"
            const weeklySales = await SaleWeekly.find().populate("userId", "username"); // Cambiado a "SaleWeekly"
    
            // Inicializar un objeto para acumular las ventas por usuario
            const userSalesSummary = {};
    
            doc.text("Reporte Semanal", { align: "center", underline: true });
            doc.moveDown();
    
            // Verificar si hay ventas
            if (weeklySales.length === 0) {
                doc.text("No hay ventas registradas en la última semana.");
            } else {
                weeklySales.forEach(({ product, quantity, date, userId }) => {
                    const userName = userId ? userId.username : "Usuario desconocido"; // Nombre del usuario
    
                    // Convertir la fecha al horario de Argentina (UTC-3)
                    const formattedDate = new Date(date).toLocaleString("es-AR", { 
                        timeZone: "America/Argentina/Buenos_Aires", 
                        hour12: true, 
                        weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric" 
                    });
    
                    // Imprimir la venta individual
                    doc.text(`${quantity} ${product}, vendidas el ${formattedDate} por ${userName}`);
    
                    // Acumular las ventas por usuario
                    if (!userSalesSummary[userName]) {
                        userSalesSummary[userName] = { totalSold: 0, products: {} };
                    }
    
                    userSalesSummary[userName].totalSold += quantity;
                    if (!userSalesSummary[userName].products[product]) {
                        userSalesSummary[userName].products[product] = 0;
                    }
                    userSalesSummary[userName].products[product] += quantity;
                });
    
                doc.moveDown();
                doc.text("Resumen por usuario:", { underline: true });
                doc.moveDown();
    
                // Agregar el resumen de ventas por usuario al final
                Object.entries(userSalesSummary).forEach(([userName, { totalSold, products }]) => {
                    const productSummary = Object.entries(products)
                        .map(([product, quantity]) => `${quantity} ${product}`)
                        .join(", ");
                    doc.text(`"${userName}": ${totalSold} productos vendidos (${productSummary})`);
                });
            }
        } catch (err) {
            console.error("Error al generar el reporte semanal:", err);
            doc.text("Error al generar el reporte semanal.");
        }
    };
    
    try {
        const doc = new PDFDocument();
        const filename = `${type}-report-${Date.now()}.pdf`;

        // Configurar cabeceras para la descarga del archivo
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

        // Generar el documento y escribir en el flujo de respuesta
        doc.pipe(res);

        // Generar el reporte según el tipo
        switch (type) {
            case "stock":
                await generateStockReport(doc);
                break;
            case "sales":
                await generateSalesReport(doc);
                break;
            case "weekly":
                await generateWeeklyReport(doc);
                break;
            default:
                res.setHeader("Content-Type", "application/json");
                return res.status(400).json({ message: "Tipo de reporte no válido" });
        }

        // Finalizar el documento PDF
        doc.end();
    } catch (err) {
        console.error("Error generando el reporte:", err);
        return res.status(500).json({ message: "Error al generar el reporte" });
    }
});

//ultimo
// Modelo de Rendición
const renditionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    productType: String,
    clientId: String,
    clientDetails: String,
    initialBoxes: Number,
    rechargeBoxes: Number,
    soldBoxes: Number,
    returnBoxes: Number,
    saleAmount: Number,
    paymentAmount: Number,
    paymentMethod: { type: String, enum: ["Efectivo", "Transferencia"], required: true }, // Nuevo campo
    balance: Number,
});

const Rendition = mongoose.model("Rendition", renditionSchema);

// Ruta para obtener todas las rendiciones asociadas al usuario autenticado (GET)
app.get("/api/renditions", authorize(), async (req, res) => {
    try {
        const renditions = await Rendition.find({ userId: req.user.id }); // Filtrar por el usuario autenticado
        res.status(200).json(renditions);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener las rendiciones" });
    }
});

// Ruta para registrar una rendición y registrarla como venta (POST)
app.post("/api/renditions", authorize(), async (req, res) => {
    const {
        productType,
        clientId,
        clientDetails,
        initialBoxes,
        rechargeBoxes,
        soldBoxes,
        returnBoxes,
        saleAmount,
        paymentAmount,
        paymentMethod,
    } = req.body;

    const balance = saleAmount - paymentAmount;

    // Validación lógica
    const totalBoxes = initialBoxes + rechargeBoxes - returnBoxes;
    if (soldBoxes > totalBoxes) {
        return res.status(400).json({
            message: "Las cajas vendidas no pueden exceder las cajas disponibles.",
        });
    }

    if (balance < 0) {
        return res.status(400).json({
            message: "El saldo no puede ser negativo.",
        });
    }

    try {

        // Validar si los detalles del cliente están asociados a otro ID
        const existingRendition = await Rendition.findOne({ clientDetails });
        if (existingRendition && existingRendition.clientId !== clientId) {
            return res.status(400).json({
                message: "Los detalles del cliente ya están asociados a otro ID. No se puede registrar esta rendición.",
            });
        }
        
        // Verificar si el producto existe en el stock
        const stockItem = await Stock.findOne({ product: productType });

        if (!stockItem) {
            return res.status(404).json({
                message: `El producto ${productType} no existe en el stock.`,
            });
        }

        // Validar que el stock disponible sea suficiente para cubrir la venta
        if (stockItem.quantity < soldBoxes) {
            return res.status(400).json({
                message: `No hay suficiente stock del producto ${productType}. 
                          Stock disponible: ${stockItem.quantity}, 
                          solicitado: ${soldBoxes}.`,
            });
        }

        // Crear la rendición
        const newRendition = new Rendition({
            userId: req.user.id,
            productType,
            clientId,
            clientDetails,
            initialBoxes,
            rechargeBoxes,
            soldBoxes,
            returnBoxes,
            saleAmount,
            paymentAmount,
            paymentMethod,
            balance,
        });
        await newRendition.save();

        // Actualizar el stock en el backend
        stockItem.quantity -= soldBoxes; // Reducir la cantidad vendida del stock
        await stockItem.save(); // Guardar los cambios en el stock

        // Registrar la venta asociada
        const newSale = new Sale({
            userId: req.user.id,
            product: productType,
            quantity: soldBoxes,
            date: new Date(),
        });
        await newSale.save();

        res.status(201).json({
            message: "Rendición registrada con éxito, venta registrada, y stock actualizado.",
            rendition: newRendition,
            sale: newSale,
            stock: stockItem,
        });
    } catch (err) {
        console.error("Error al registrar la rendición o actualizar el stock:", err);
        res.status(500).json({ message: "Error al registrar la rendición y actualizar el stock." });
    }
});

// Botón de Cerrar Sesión

app.post("/api/logout", authorize(), (req, res) => {
    try {
        // En este caso no necesitamos invalidar el token porque este expirará automáticamente
        // Pero si quieres agregar una lista negra de tokens, este sería el lugar para hacerlo

        res.status(200).json({ message: "Sesión cerrada con éxito" });
    } catch (err) {
        res.status(500).json({ message: "Error al cerrar sesión" });
    }
});

// Ruta para verificar si un cliente tiene una contrafactura pendiente
app.get("/api/renditions/check-contrafactura/:clientId", authorize(), async (req, res) => {
    const { clientId } = req.params;

    try {
        const pendingRenditions = await Rendition.find({
            clientId,
            balance: { $gt: 0 }, // Buscar rendiciones con saldo pendiente
        });

        if (pendingRenditions.length > 0) {
            return res.status(400).json({ message: "El cliente tiene una contrafactura pendiente. Debe pagarla antes de registrar un nuevo pedido." });
        }

        res.status(200).json({ message: "El cliente no tiene contrafacturas pendientes." });
    } catch (err) {
        res.status(500).json({ message: "Error al verificar la contrafactura" });
    }
});

// Ruta para obtener contrafacturas pendientes
app.get("/api/renditions/pending-contrafacturas", authorize(), async (req, res) => {
    try {
        const pendingContrafacturas = await Rendition.find({
            userId: req.user.id,
            balance: { $gt: 0 }, // Saldo pendiente mayor a 0
        });

        res.status(200).json(pendingContrafacturas);
    } catch (err) {
        res.status(500).json({ message: "Error al obtener las contrafacturas pendientes" });
    }
});

// Ruta para registrar el pago de una contrafactura
app.post("/api/renditions/pay-contrafactura/:id", authorize(), async (req, res) => {
    const { id } = req.params; // ID de la contrafactura
    const { paymentAmount } = req.body; // Monto de pago enviado en el cuerpo

    if (!paymentAmount || paymentAmount <= 0) {
        return res.status(400).json({ message: "El monto de pago es inválido." });
    }

    try {
        // Buscar la contrafactura por ID
        const contrafactura = await Rendition.findById(id);

        if (!contrafactura) {
            return res.status(404).json({ message: "La contrafactura no existe." });
        }

        if (paymentAmount > contrafactura.balance) {
            return res.status(400).json({ message: "El monto de pago no puede ser mayor al saldo pendiente." });
        }

        // Actualizar el balance de la contrafactura
        contrafactura.paymentAmount += paymentAmount;
        contrafactura.balance = Math.max(contrafactura.saleAmount - contrafactura.paymentAmount, 0);

        // Guardar los cambios
        await contrafactura.save();

        res.status(200).json({ message: "Pago registrado con éxito.", contrafactura });
    } catch (error) {
        console.error("Error al procesar el pago de la contrafactura:", error);
        res.status(500).json({ message: "Error al registrar el pago." });
    }
});

// Ruta para eliminar todas las rendiciones asociadas al usuario autenticado (DELETE)
app.delete("/api/renditions", authorize(), async (req, res) => {
    try {
        await Rendition.deleteMany({ userId: req.user.id }); // Eliminar rendiciones del usuario
        res.status(200).json({ message: "Todas las rendiciones han sido eliminadas" });
    } catch (err) {
        res.status(500).json({ message: "Error al eliminar las rendiciones" });
    }
});

// Ruta que verifica si un cliente ya está registrado y valida sus detalles
app.get("/api/renditions/check-client/:clientId", authorize(), async (req, res) => {
    const { clientId } = req.params;

    try {
        // Verificar si el cliente tiene contrafacturas pendientes
        const pendingRenditions = await Rendition.find({
            clientId,
            balance: { $gt: 0 }, // Buscar rendiciones con saldo pendiente
        });

        if (pendingRenditions.length > 0) {
            return res.status(400).json({ 
                message: "El cliente tiene una contrafactura pendiente. Debe pagarla antes de registrar una nueva rendición." 
            });
        }

        // Buscar una rendición previa del cliente
        const existingRendition = await Rendition.findOne({ clientId });

        if (existingRendition) {
            // Si existe una rendición previa, devolver los detalles registrados del cliente
            return res.status(200).json({
                clientDetails: existingRendition.clientDetails,
                message: "Cliente encontrado. Los detalles deben coincidir con los registrados."
            });
        }

        // Si no hay rendiciones previas para el cliente
        res.status(200).json({
            clientDetails: null,
            message: "Cliente no registrado previamente. Puede proceder con nuevos detalles."
        });
    } catch (err) {
        console.error("Error al verificar los detalles del cliente:", err);
        res.status(500).json({ message: "Error al verificar los detalles del cliente" });
    }
});

app.post("/api/sales/transfer-to-weekly", authorize(), async (req, res) => {
    try {
        // Obtener todas las ventas diarias
        const dailySales = await Sale.find();

        if (dailySales.length === 0) {
            return res.status(200).json({ message: "No hay ventas diarias para transferir." });
        }

        // Transferir las ventas al modelo de ventas semanales
        const weeklySales = dailySales.map((sale) => ({
            userId: sale.userId,
            product: sale.product,
            quantity: sale.quantity,
            date: sale.date,
        }));

        await SaleWeekly.insertMany(weeklySales);

        // Eliminar las ventas diarias
        await Sale.deleteMany();

        res.status(200).json({ message: "Ventas diarias transferidas a ventas semanales con éxito." });
    } catch (error) {
        console.error("Error al transferir las ventas diarias a semanales:", error);
        res.status(500).json({ message: "Error al transferir las ventas diarias a semanales." });
    }
});


//hasta aca

// Inicialización del servidor
app.listen(port, async () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);

    // Crear usuario admin por defecto si no existe
    const adminExists = await User.findOne({ username: "admin" });
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash("admin123", 10);
        await User.create({ username: "admin", password: hashedPassword, role: "admin" });
        console.log("Usuario admin creado con credenciales por defecto.");
    }
});
