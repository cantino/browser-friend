import React from "react";
import { useStorage } from "@plasmohq/storage/hook";

function IndexOptions() {
  const [openaiKey, setOpenaiKey] = useStorage<string>("openai-key", "");
  const [model, setModel] = useStorage<string>("openai-model", "gpt-4");

  const styles = {
    container: {
      display: "flex",
      flexDirection: "column" as "column",
      padding: 16,
      maxWidth: "300px",
      backgroundColor: "#f5f5f5",
      borderRadius: "5px",
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
    },
    label: {
      marginBottom: "0.5rem",
    },
    input: {
      marginBottom: "1rem",
      padding: "0.5rem",
      borderRadius: "5px",
      border: "1px solid #ccc",
    },
    select: {
      padding: "0.5rem",
      borderRadius: "5px",
      border: "1px solid #ccc",
      appearance: "none" as "none",
    },
  };

  return (
    <div style={styles.container}>
      <label htmlFor={"openai-key"} style={styles.label}>
        OpenAI API Key
      </label>
      <input
        type={"text"}
        name={"openai-key"}
        value={openaiKey}
        onChange={(e) => setOpenaiKey(e.target.value)}
        style={styles.input}
      />
      <label htmlFor={"model-select"} style={styles.label}>
        Model
      </label>
      <select
        name="model-select"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        style={styles.select}
      >
        <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
        <option value="gpt-4">gpt-4</option>
      </select>
    </div>
  );
}

export default IndexOptions;