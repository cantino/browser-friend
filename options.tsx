import { useStorage } from "@plasmohq/storage/hook"

function IndexOptions() {
  const [openaiKey, setOpenaiKey] = useStorage<string>("openai-key", "")

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 16
      }}>
      <label htmlFor={"openai-key"}>OpenAI API Key</label>
      <input
        type={"text"}
        name={"openai-key"}
        value={openaiKey}
        onChange={(e) => setOpenaiKey(e.target.value)}
        style={{ maxWidth: "300px" }}
      />
    </div>
  )
}

export default IndexOptions