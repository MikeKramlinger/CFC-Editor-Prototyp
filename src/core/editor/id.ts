export const getNextSerialForPrefix = (prefix: "N" | "C", ids: Iterable<string>): number => {
  let maxSerial = 0;
  const prefixLength = prefix.length;

  for (const id of ids) {
    if (!id.startsWith(prefix)) {
      continue;
    }

    const raw = Number(id.slice(prefixLength));
    if (Number.isFinite(raw) && raw > maxSerial) {
      maxSerial = Math.floor(raw);
    }
  }

  return maxSerial + 1;
};
