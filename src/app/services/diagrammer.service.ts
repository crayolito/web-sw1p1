import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../environments/environment';
import { ColaboradoresResponse, DataSalaResponse, GraphToCodigo } from '../interfaces/req-response';
import { WebsocketService } from './websocket.service';

@Injectable({
  providedIn: 'root',
})
export class DiagrammerService {
  private http = inject(HttpClient);
  public wsService = inject(WebsocketService);
  public viewActionsFile = signal(false);
  public viewActionsDev = signal(false);

  public onChangeviewActionsFile(value: boolean): void {
    this.viewActionsFile.set(value);
  }
  public getViewActionsFile(): boolean {
    return this.viewActionsFile();
  }

  public onChangeviewActionsDev(value: boolean): void {
    this.viewActionsDev.set(value);
  }

  public getViewActionsDev(): boolean {
    return this.viewActionsDev();
  }

  // FUNCION PARA ESCUCHAR UN EVENTO ESPECIFICO
  public escucharPruebaMensaje() {
    return this.wsService.listen('mensaje-servidor');
  }

  // FUNCION PARA ENVIAR UN MENSAJE AL SERVIDOR
  public enviarPruebaMensaje(mensaje: string) {
    this.wsService.emit('mensaje-cliente', mensaje);
  }

  // FUNCIONES Y PROCEDIMIENTO CON SOCKET
  // SOBRE EL DIAGRAMA DE SECUENCIA


  public entrarSalaTrabajo(nombreSala: string, usuario: string) {
    this.wsService.emit('entrar-sala-trabajo', {
      usuario,
      nombreSala,
    });
  }

  public salirSalaTrabajo(nombreSala: string, usuario: string) {
    this.wsService.emit('salir-sala-trabajo',
      {
        usuario,
        nombreSala,
      }
    );
  }

  // ESCUCHAR DATA DE LA SALA DE TRABAJO ENVIADA POR EL SERVER
  public escucharDataSalaTrabajo() {
    return this.wsService.listen('data-sala-trabajo');
  }

  // ESUCHAR ENTRA O SALE UN USUARIO DE LA SALA DE TRABAJO
  public colaboradoresSalaTrabajo() {
    return this.wsService.listen('colaboradores-sala-trabajo');
  }

  // ENVIAR DATA DE LA SALA DE TRABAJO AL SERVER
  public enviarDataSalaTrabajo(data: any) {
    this.wsService.emit('data-sala-trabajo', data);
  }

  public getDatSala(sala: string) {
    return this.http.post<DataSalaResponse>(`${environment.apiUrl}/salaData`, { sala }).pipe(
      map((res: any): DataSalaResponse => ({
        ok: res.ok,
        sala: res.sala,
        data: res.data
      }))
    );
  }


  public graphTocodigo(lenguaje: string, info: string) {
    return this.http.post<GraphToCodigo>(`${environment.apiUrl}/codigoIA`, { lenguaje, info }).pipe(
      map((res: any): GraphToCodigo => ({
        infoCodigo: res.infoCodigo,
        ok: res.ok,
      }))
    );
  }

  public asistenciaBorrar(usuario: string, sala: string) {
    return this.http.post(`${environment.apiUrl}/asistenciaBorrar`, { usuario, sala });
  }

  public salaVacia(sala: string) {
    return this.http.post(`${environment.apiUrl}/borrarSala`, { sala });
  }

  public getColaboradores(sala: string) {
    return this.http.post<ColaboradoresResponse>(`${environment.apiUrl}/asistentesSala`, { sala });
  }
}
