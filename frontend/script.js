document.addEventListener("DOMContentLoaded", () => {
    // Elementos comunes
    const authForm = document.getElementById("authForm");
    const authError = document.getElementById("authError");
    const authSection = document.getElementById("auth");
    const registerForm = document.getElementById("registerForm");
    const registerError = document.getElementById("registerError");
    const registerSection = document.getElementById("register");
    const dashboard = document.getElementById("dashboard");
    const reportsSection = document.getElementById("reports");
    const stockView = document.getElementById("stockView");
    const stockList = document.getElementById("stockList");
    const actionInput = document.getElementById("actionInput");
    const actionButton = document.getElementById("actionButton");
    const actionButtons = document.querySelectorAll(".action-button");
    const actionsTitle = document.getElementById("actionsTitle");
    const reportButtons = document.querySelectorAll(".report-button");

    let selectedAction = "add"; // Acción seleccionada por defecto
    let userRole = null; // Rol del usuario autenticado

    /**
     * Alternar entre las vistas de inicio de sesión y registro.
     */
    function toggleAuthViews() {
        authSection.style.display = authSection.style.display === "none" ? "block" : "none";
        registerSection.style.display = registerSection.style.display === "none" ? "block" : "none";
    }
    
    document.getElementById("showLogin").addEventListener("click", toggleAuthViews);

    /**
     * Redirigir al formulario de registro desde el panel de administrador.
     */
    document.getElementById("registerNewUserButton").addEventListener("click", () => {
        dashboard.style.display = "none";
        registerSection.style.display = "block";
        registerForm.reset(); // Limpiar el formulario de registro
        registerError.textContent = ""; // Limpiar errores previos
    });

    /**
    * Registro de un nuevo usuario.
    */
    async function registerUser(event) {
        event.preventDefault();
        const username = document.getElementById("registerUsername").value;
        const password = document.getElementById("registerPassword").value;
        const role = document.getElementById("registerRole").value;

        try {
            const token = localStorage.getItem("token"); // Recuperar el token de autenticación
            if (!token) throw new Error("No estás autenticado. Inicia sesión nuevamente.");

            const response = await fetch("https://gestiondestock-jv3a.onrender.com/api/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}` // Incluir el token en el encabezado
                },
                body: JSON.stringify({ username, password, role }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            registerError.textContent = "Usuario registrado exitosamente. Volviendo al panel.";
            setTimeout(() => {
                registerSection.style.display = "none";
                dashboard.style.display = "block"; // Volver al panel de administración
            }, 2000);
        } catch (error) {
            registerError.textContent = error.message || "Error al registrar el usuario.";
        }
    }

    /**
     * Autenticación del usuario.
     */
    async function authenticateUser(event) {
        event.preventDefault();
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;

        try {
            const response = await fetch("https://gestiondestock-jv3a.onrender.com/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            localStorage.setItem("token", result.token);
            localStorage.setItem("role", result.role);

            userRole = result.role;

            authSection.style.display = "none";
            dashboard.style.display = "block";

            if (userRole === "admin") {
                reportsSection.style.display = "block";
            }

            updateStockView();
        } catch (error) {
            authError.textContent = error.message || "Error al iniciar sesión.";
        }
    }

    /**
     * Actualiza la vista del stock desde el servidor.
     */
    async function updateStockView() {
        try {
            const token = localStorage.getItem("token"); // Obtener token del localStorage
            if (!token) throw new Error("No estás autenticado. Inicia sesión nuevamente.");

            const response = await fetch("https://gestiondestock-jv3a.onrender.com/api/stock", {
                headers: { "Authorization": `Bearer ${token}` },
            });

            if (!response.ok) throw new Error("Error al obtener el stock.");
            const stock = await response.json();

            stockList.innerHTML = ""; // Limpiar lista

            if (stock.length === 0) {
                stockList.innerHTML = "<li>No hay productos en el stock.</li>";
            } else {
                stock.forEach(({ product, quantity }) => {
                    const li = document.createElement("li");
                    li.textContent = `${product}: ${quantity} unidades`;
                    stockList.appendChild(li);
                });
            }
        } catch (error) {
            console.error(error);
            alert("Error al actualizar la vista del stock.");
        }
    }

    /**
     * Manejo de acciones (Agregar, Solicitar, Devolver).
     */
    async function handleAction() {
        const input = actionInput.value.trim();

        if (!input) {
            alert("Por favor, ingresa un producto y cantidad. Ejemplo: 'producto, cantidad'");
            return;
        }

        const [product, rawQuantity] = input.split(",").map((item) => item.trim());
        const quantity = parseInt(rawQuantity, 10);

        if (!product || isNaN(quantity) || quantity <= 0) {
            alert("Formato incorrecto. Usa el formato: 'producto, cantidad'");
            return;
        }

        try {
            const token = localStorage.getItem("token"); // Obtener token del localStorage
            if (!token) throw new Error("No estás autenticado. Inicia sesión nuevamente.");

            const response = await fetch("https://gestiondestock-jv3a.onrender.com/api/stock", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`, // Agregar el token en el encabezado
                },
                body: JSON.stringify({
                    action: selectedAction,
                    product,
                    quantity,
                }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Error al realizar la acción.");

            alert(`Acción completada: ${result.product} ahora tiene ${result.quantity} unidades.`);
            actionInput.value = ""; // Limpiar input
            updateStockView(); // Actualizar la vista del stock
        } catch (error) {
            console.error(error);
            alert(error.message || "Error al realizar la acción.");
        }
    }

    /**
     * Manejo de reportes.
     */
    let isDownloading = false;  // Flag para evitar múltiples descargas

    async function handleReport(type) {
        if (isDownloading) {
            alert("Ya estás descargando el reporte.");
            return;  // Evitar múltiples descargas simultáneas
        }

        try {
            const token = localStorage.getItem("token");
            if (!token) throw new Error("No estás autenticado. Inicia sesión nuevamente.");

            // Marca como descargando
            isDownloading = true;

            const response = await fetch(`https://gestiondestock-jv3a.onrender.com/api/reports/${type}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error("Error al generar el reporte.");

            // Crear un blob con la respuesta y generar una URL
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            // Crear el enlace de descarga
            const link = document.createElement("a");
            link.href = url;
            link.download = `${type}-report.pdf`;

            // Se asegura de que el link solo sea clickeado una vez
            document.body.appendChild(link);  // Agregar el enlace al DOM
            link.click();
            document.body.removeChild(link); // Eliminar el enlace después de usarlo

            // Liberar el objeto URL creado
            window.URL.revokeObjectURL(url);

            alert("Reporte descargado exitosamente.");
        } catch (error) {
            console.error(error);
            alert(error.message || "Error al generar el reporte.");
        } finally {
            // Restablecer el flag después de que la descarga haya terminado
            isDownloading = false;
        }
    }

    // Evento para manejar los botones de reporte
    reportButtons.forEach((button) => {
        button.addEventListener("click", () => handleReport(button.dataset.type));
    });

    // Eventos de formularios
    authForm.addEventListener("submit", authenticateUser);
    registerForm.addEventListener("submit", registerUser);

    actionButtons.forEach((button) => {
        button.addEventListener("click", () => {
            actionButtons.forEach((btn) => btn.classList.remove("selected"));
            button.classList.add("selected");
            selectedAction = button.dataset.action;
            updateActionsTitle(selectedAction);
        });
    });

    actionButton.addEventListener("click", handleAction);

    reportButtons.forEach((button) => {
        button.addEventListener("click", () => handleReport(button.dataset.type));
    });

    /**
     * Actualiza el título de acciones con la opción seleccionada.
     */
    function updateActionsTitle(action) {
        const actionTexts = {
            add: "Agregar al stock",
            request: "Solicitar del stock",
            return: "Devolver al stock",
            sale: "Registrar venta",
        };

        const actionText = actionTexts[action] || "Acción desconocida";
        actionsTitle.innerHTML = `Acciones <span>(${actionText})</span>`;
    }

    authForm.addEventListener("submit", authenticateUser);
    registerForm.addEventListener("submit", registerUser);

    updateActionsTitle(selectedAction); // Título inicial

    //ultimo

    const renditionForm = document.getElementById("renditionForm");
    const renditionsTable = document.getElementById("renditionsTable");
    const salesSummaryTable = document.getElementById("salesSummaryTable");

    // Función para calcular la cantidad a devolver
    const calculateReturnBoxes = () => {
        const initialBoxes = parseInt(document.getElementById("initialBoxes").value || 0, 10);
        const rechargeBoxes = parseInt(document.getElementById("rechargeBoxes").value || 0, 10);
        const soldBoxes = parseInt(document.getElementById("soldBoxes").value || 0, 10);

        const returnBoxes = Math.max((initialBoxes + rechargeBoxes) - soldBoxes, 0);
        document.getElementById("returnBoxes").value = returnBoxes;
    };

    // Eventos para recalcular la cantidad a devolver
    document.getElementById("soldBoxes").addEventListener("input", calculateReturnBoxes);
    document.getElementById("initialBoxes").addEventListener("input", calculateReturnBoxes);
    document.getElementById("rechargeBoxes").addEventListener("input", calculateReturnBoxes);

    // Función para cargar las rendiciones desde el servidor
    const fetchRenditions = async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) throw new Error("No estás autenticado. Por favor, inicia sesión.");
    
            const response = await fetch("https://gestiondestock-jv3a.onrender.com/api/renditions", {
                method: "GET",
                headers: { "Authorization": `Bearer ${token}` },
            });
    
            if (!response.ok) throw new Error("No se pudo obtener las rendiciones.");
    
            const renditions = await response.json();
    
            // Actualizar tablas dinámicamente
            updateRenditionsTable(renditions);
            updateSalesSummaryTable(renditions);
        } catch (error) {
            console.error("Error al obtener las rendiciones:", error);
            alert(error.message);
        }
    };
    
    // Función para actualizar la tabla de rendiciones
    const updateRenditionsTable = (renditions) => {
        renditionsTable.innerHTML = ""; // Limpia la tabla
    
        renditions.forEach((rendition) => {
            const row = document.createElement("tr");
    
            // Validar si el importe de cobranza es mayor al importe de venta
            const isPaymentExceedsSale = rendition.paymentAmount > rendition.saleAmount;
    
            row.innerHTML = `
                <td>${rendition.productType}</td>
                <td>${rendition.clientId}</td>
                <td>${rendition.clientDetails}</td>
                <td>${rendition.initialBoxes}</td>
                <td>${rendition.rechargeBoxes}</td>
                <td>${rendition.soldBoxes}</td>
                <td>${rendition.returnBoxes}</td>
                <td>${rendition.paymentMethod}</td>
                <td>${rendition.saleAmount.toFixed(2)}</td>
                <td class="${isPaymentExceedsSale ? 'error' : ''}">${rendition.paymentAmount.toFixed(2)}</td>
                <td>${rendition.balance.toFixed(2)}</td>
            `;
    
            // Agregar advertencia visual si el importe de cobranza excede el importe de venta
            if (isPaymentExceedsSale) {
                const warningCell = document.createElement("td");
                warningCell.textContent = "¡Cobranza > Venta!";
                warningCell.classList.add("warning");
                row.appendChild(warningCell);
            }
    
            renditionsTable.appendChild(row);
        });
    };
    
    // Función para actualizar la tabla de ventas totales
    const updateSalesSummaryTable = (renditions) => {
        salesSummaryTable.innerHTML = ""; // Limpia la tabla
    
        const salesSummary = {}; // Ventas totales por tipo de producto
        const salesRemaining = {}; // Saldos pendientes por tipo de producto
    
        // Inicializa las ventas y los saldos pendientes
        renditions.forEach((rendition) => {
            if (!salesSummary[rendition.productType]) {
                salesSummary[rendition.productType] = 0;
                salesRemaining[rendition.productType] = 0;
            }
            salesSummary[rendition.productType] += rendition.saleAmount;
            salesRemaining[rendition.productType] += rendition.saleAmount;
        });
    
        // Restar el importe de cobranza del saldo pendiente
        renditions.forEach((rendition) => {
            if (salesRemaining[rendition.productType] !== undefined) {
                salesRemaining[rendition.productType] -= rendition.paymentAmount;
                if (salesRemaining[rendition.productType] < 0) {
                    salesRemaining[rendition.productType] = 0; // Evita saldos negativos
                }
            }
        });
    
        // Mostrar el resumen de ventas por producto
        for (const [productType, totalSales] of Object.entries(salesSummary)) {
            const summaryRow = document.createElement("tr");
            const totalCobrado = totalSales - salesRemaining[productType]; // Total cobrado
    
            summaryRow.innerHTML = `
                <td>${productType}</td>
                <td>${totalCobrado.toFixed(2)}</td> <!-- Muestra lo cobrado hasta el momento -->
            `;
            salesSummaryTable.appendChild(summaryRow);
        }
        fetchRenditions();
    };
    
    // Manejar el envío del formulario
    renditionForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const clientId = document.getElementById("clientId").value;
        const clientDetails = document.getElementById("clientDetails").value;

        try {
            // Verificar si el cliente ya existe
            const checkResponse = await fetch(`https://gestiondestock-jv3a.onrender.com/api/renditions/check-client/${clientId}`, {
                method: "GET",
                headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
            });

            if (!checkResponse.ok) {
                const errorResponse = await checkResponse.json();
                alert(errorResponse.message || "Error al verificar el cliente");
                return;
            }

            const clientData = await checkResponse.json();

            // Validar que los detalles del cliente coincidan si ya está registrado
            if (clientData && clientData.clientDetails && clientData.clientDetails !== clientDetails) {
                alert("Los detalles del cliente no coinciden con los registrados.");
                return;
            }

            const formData = {
                productType: document.getElementById("productType").value,
                clientId,
                clientDetails,
                initialBoxes: parseInt(document.getElementById("initialBoxes").value, 10),
                rechargeBoxes: parseInt(document.getElementById("rechargeBoxes").value, 10),
                soldBoxes: parseInt(document.getElementById("soldBoxes").value, 10),
                returnBoxes: parseInt(document.getElementById("returnBoxes").value, 10),
                saleAmount: parseFloat(document.getElementById("saleAmount").value),
                paymentAmount: parseFloat(document.getElementById("paymentAmount").value),
                paymentMethod: document.getElementById("paymentMethod").value, // Nuevo campo
            };

            // Validar que el importe de cobranza no sea mayor al importe de venta antes de enviar
            if (formData.paymentAmount > formData.saleAmount) {
                alert("El importe de cobranza no puede ser mayor al importe de venta.");
                return;
            }

            // Registrar rendición y venta en el backend
            const response = await fetch("https://gestiondestock-jv3a.onrender.com/api/renditions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                renditionForm.reset();
                calculateReturnBoxes();
                fetchRenditions();
                fetchPendingContrafacturas();
                alert("Rendición registrada con éxito y registrada como venta.");
            } else {
                const errorResponse = await response.json();
                alert("Error al registrar la rendición: " + (errorResponse.message || "Error desconocido"));
            }
        } catch (error) {
            console.error("Error al enviar la rendición:", error);
            alert(error.message);
        }
    });

    // Cargar las rendiciones al cargar la página
    fetchRenditions();

});

const paymentForm = document.getElementById("paymentForm");
const pendingContrafacturas = document.getElementById("pendingContrafacturas");

// Función para cargar contrafacturas pendientes
const fetchPendingContrafacturas = async () => {
    try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No estás autenticado. Por favor, inicia sesión.");

        const response = await fetch("https://gestiondestock-jv3a.onrender.com/api/renditions/pending-contrafacturas", {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}` },
        });

        if (!response.ok) throw new Error("No se pudieron obtener las contrafacturas pendientes.");

        const contrafacturas = await response.json();

        // Limpiar el select de contrafacturas pendientes
        pendingContrafacturas.innerHTML = "";

        if (contrafacturas.length === 0) {
            const option = document.createElement("option");
            option.textContent = "No hay contrafacturas pendientes";
            option.disabled = true;
            pendingContrafacturas.appendChild(option);
        } else {
            contrafacturas.forEach((contrafactura) => {
                const option = document.createElement("option");
                option.value = contrafactura._id;
                option.textContent = `Cliente: ${contrafactura.clientId}, ${contrafactura.productType}, Saldo P: $${contrafactura.balance.toFixed(2)}`;
                option.setAttribute("data-balance", contrafactura.balance); // Agregar saldo pendiente
                pendingContrafacturas.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Error al obtener las contrafacturas pendientes:", error);
        alert(error.message);
    }
};

// Manejar el envío del formulario de pago
paymentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const contrafacturaId = pendingContrafacturas.value;
    const paymentAmount = parseFloat(document.getElementById("paymentAmountInput").value);

    if (!contrafacturaId) {
        alert("Selecciona una contrafactura válida.");
        return;
    }

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        alert("El monto de pago debe ser un número mayor a 0.");
        return;
    }

    // Validar que el monto de pago no sea mayor al saldo pendiente
    const selectedOption = pendingContrafacturas.options[pendingContrafacturas.selectedIndex];
    const saldoPendiente = parseFloat(selectedOption.getAttribute("data-balance"));

    if (paymentAmount > saldoPendiente) {
        alert("El monto de pago no puede ser mayor al saldo pendiente.");
        return;
    }

    try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No estás autenticado. Por favor, inicia sesión.");

        const response = await fetch(`https://gestiondestock-jv3a.onrender.com/api/renditions/pay-contrafactura/${contrafacturaId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ paymentAmount }),
        });

        if (response.ok) {
            alert("Pago registrado con éxito.");
            fetchPendingContrafacturas(); // Actualizar las contrafacturas pendientes
            // Actualizar la tabla de rendiciones
        } else {
            const errorResponse = await response.json();
            alert("Error al registrar el pago: " + (errorResponse.message || "Error desconocido"));
        }
    } catch (error) {
        console.error("Error al registrar el pago:", error);
        alert(error.message);
    }
});

// Cargar las contrafacturas pendientes al cargar la página
fetchPendingContrafacturas();

// Botón de Cerrar Sesión
document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
        const token = localStorage.getItem("token");

        // Enviar la solicitud de cierre de sesión al servidor
        const response = await fetch("https://gestiondestock-jv3a.onrender.com/api/logout", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
            },
        });

        if (response.ok) {
            // Eliminar el token y redirigir al inicio de sesión
            localStorage.removeItem("token");
            document.getElementById("dashboard").style.display = "none";
            document.getElementById("auth").style.display = "block";
            alert("Sesión cerrada con éxito");
        } else {
            const errorResponse = await response.json();
            console.error("Error al cerrar sesión:", errorResponse.message);
            alert("Error al cerrar sesión: " + (errorResponse.message || "Error desconocido"));
        }
    } catch (err) {
        console.error("Error al cerrar sesión:", err);
        alert("Error al cerrar sesión: " + err.message);
    }
});

const resetTablesButton = document.getElementById("resetTablesButton");

resetTablesButton.addEventListener("click", async () => {
    // Mostrar cuadro de confirmación
    const userConfirmed = confirm("¿Está seguro de que desea reiniciar las tablas? Esto eliminará todos los datos asociados.");

    if (!userConfirmed) {
        alert("La acción de reiniciar las tablas fue cancelada."); // Mensaje si el usuario cancela
        return; // Salir si no confirma
    }

    try {
        const response = await fetch("https://gestiondestock-jv3a.onrender.com/api/renditions", {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`,
            },
        });

        if (response.ok) {
            // Limpiar las tablas en el frontend
            renditionsTable.innerHTML = "";
            salesSummaryTable.innerHTML = "";

            alert("Las tablas y los datos asociados han sido reiniciados.");
        } else {
            const errorResponse = await response.json();
            alert("Error al reiniciar las tablas: " + (errorResponse.message || "Error desconocido"));
        }
    } catch (error) {
        console.error("Error al reiniciar las tablas:", error);
        alert(error.message);
    }
});
