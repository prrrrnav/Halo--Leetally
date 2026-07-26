export function float32ToPcm16(input: Float32Array): ArrayBuffer {
  const output = new ArrayBuffer(input.length * 2);
  const view = new DataView(output);

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));

    const pcmSample =
      sample < 0
        ? sample * 0x8000
        : sample * 0x7fff;

    view.setInt16(index * 2, pcmSample, true);
  }

  return output;
}