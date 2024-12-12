document.addEventListener("DOMContentLoaded", () => {
  const stockView = document.getElementById("stockView");
  const actionInput = document.getElementById("actionInput");
  const actionButton = document.getElementById("actionButton");
  const actionButtons = document.querySelectorAll(".action-button");
  const actionsTitle = document.getElementById("actionsTitle");

  const API_URL = "https://gestiondestock-jv3a.onrender.com/api/stock"; // Reemplaza con tu URL de backend en Render

  let selectedAction = "add"; // Acción seleccionada por defecto

  /**
   * Actualiza el título de acciones con la opción seleccionada.
   */
  function updateActionsTitle(action) {
      const actionTexts = {
          add: "Agregar al stock",
          request: "Solicitar del stock",
          return: "Devolver al stock",
      };

      const actionText = actionTexts[action] || "Acción desconocida";
      actionsTitle.innerHTML = `Acciones <span>(${actionText})</span>`;
  }

  /**
   * Función para actualizar la vista del stock desde el backend.
   */
  async function updateStockView() {
      try {
          const response = await fetch(API_URL);
          if (!response.ok) throw new Error("Error al obtener el stock.");
          const stock = await response.json();

          const ul = document.createElement("ul");
          ul.innerHTML = "";

          if (stock.length === 0) {
              const li = document.createElement("li");
              li.textContent = "No hay productos en el stock.";
              ul.appendChild(li);
          } else {
              stock.forEach(({ product, quantity }) => {
                  const li = document.createElement("li");
                  li.textContent = `${product}: ${quantity} unidades`;
                  ul.appendChild(li);
              });
          }
          stockView.innerHTML = ""; // Limpiar el contenedor
          stockView.appendChild(ul);
      } catch (error) {
          console.error(error);
          alert("Error al actualizar la vista del stock.");
      }
  }

  /**
   * Función para manejar acciones (Agregar, Solicitar, Devolver) enviadas al backend.
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
          const response = await fetch(API_URL, {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
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
   * Evento para cambiar la acción seleccionada al hacer clic en un botón.
   */
  actionButtons.forEach((button) => {
      button.addEventListener("click", () => {
          // Remover estilos previos
          actionButtons.forEach((btn) => btn.classList.remove("selected"));
          // Marcar el botón actual como seleccionado
          button.classList.add("selected");
          selectedAction = button.dataset.action; // Guardar la acción
          updateActionsTitle(selectedAction); // Actualizar el título
      });
  });

  // Asignar evento al botón de realizar acción
  actionButton.addEventListener("click", handleAction);

  // Actualizar la vista inicial
  updateStockView();
  updateActionsTitle(selectedAction); // Título inicial
});
