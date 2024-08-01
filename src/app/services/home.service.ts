import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SalaResponse, UnirseSalaXcodigo, Usuario, UsuarioResponse } from '../interfaces/req-response';
import { WebsocketService } from './websocket.service';

@Injectable({
  providedIn: 'root',
})
export class HomeService {
  usuarioAUX: Usuario = {
    email: '',
    password: ''
  };
  private http = inject(HttpClient);
  public wsService = inject(WebsocketService);
  public viewActions = signal(false);
  public usuarioAuth = signal<Usuario>(this.usuarioAUX);
  // Es para tomar encuenta si la persona ya en un pasado entro a la pagina
  // true : indica que la persona tiene la cuenta iniciada
  // false : indica que la persona ni registrado esta o cerro sesion
  public isAuthenticaded = signal(false);

  public updateUsuarioAuth(email: string, password: string): void {
    const usuarioData = localStorage.getItem('usuario');
    if (usuarioData) {
      const usuario = JSON.parse(usuarioData) as Usuario;
    }

    const usuarioAuthEntrada: Usuario = {
      email,
      password
    };
    this.usuarioAuth.set(usuarioAuthEntrada);
  }

  public onChangeIsAuthenticaded(value: boolean): void {
    this.isAuthenticaded.set(value);
  }

  public getIsAuthenticaded(): boolean {
    return this.isAuthenticaded();
  }

  public onChangeviewActions(): void {
    this.viewActions.set(!this.viewActions());
  }
  public getViewActions(): boolean {
    return this.viewActions();
  }

  public registroUsuario(email: string, password: string): Observable<UsuarioResponse> {
    return this.http.post<UsuarioResponse>(`${environment.apiUrl}/auth/registre`,
      {
        email,
        password
      }
    ).pipe(
      map((res: any): UsuarioResponse => ({
        ok: res.ok,
        usuario: {
          email: res.email,
          password: res.password
        }
      }))
    );
  }

  public loginUsuario(email: string, password: string): Observable<UsuarioResponse> {
    return this.http.post(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
      map((res: any): UsuarioResponse => ({
        ok: res.ok,
        usuario: {
          email: res.email,
          password: res.password
        }
      }))
    );
  }

  public crearSala(usuario: string, sala: string) {
    return this.http.post<SalaResponse>(`${environment.apiUrl}/salaCreate`,
      {
        usuario,
        sala
      }
    );
  }

  public asistenciaEntrar(usuario: string, sala: string) {
    return this.http.post<SalaResponse>(`${environment.apiUrl}/asistenciaAnotar`,
      {
        usuario,
        sala
      }
    );
  }

  public unirmesalaXcodigo(sala: string) {
    return this.http.post<UnirseSalaXcodigo>(`${environment.apiUrl}/unirseSalaXcodigo`, { sala }).pipe(
      map((res: any): UnirseSalaXcodigo => ({
        ok: res.ok,
        sala: res.sala,
      }))
    );
  }
}

