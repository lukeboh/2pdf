declare module "plantuml-encoder" {
  const plantumlEncoder: {
    encode: (text: string) => string;
  };
  export default plantumlEncoder;
}
