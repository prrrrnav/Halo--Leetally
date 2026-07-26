export interface SpeechProvider{listen():Promise<string>;speak(text:string):Promise<void>;}
export class BrowserSpeechProvider implements SpeechProvider{
  async listen():Promise<string>{throw new Error("Speech recognition is a Day 6 task");}
  async speak(text:string){speechSynthesis.speak(new SpeechSynthesisUtterance(text));}
}
