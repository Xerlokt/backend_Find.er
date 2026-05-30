export type DiscDimension = 'D' | 'I' | 'S' | 'C'

export interface DiscOption {
  dimension: DiscDimension
  text: string
}

export interface DiscQuestion {
  id: number
  text: string
  options: DiscOption[]  // always exactly 4, one per dimension
}

export const DISC_QUESTIONS: DiscQuestion[] = [
  {
    id: 1,
    text: 'Em situações de trabalho, eu costumo ser:',
    options: [
      { dimension: 'D', text: 'Determinado e direto ao ponto' },
      { dimension: 'I', text: 'Entusiasta e sociável' },
      { dimension: 'S', text: 'Paciente e colaborativo' },
      { dimension: 'C', text: 'Analítico e cuidadoso com os detalhes' },
    ],
  },
  {
    id: 2,
    text: 'Quando enfrento um problema no trabalho, eu prefiro:',
    options: [
      { dimension: 'D', text: 'Tomar uma decisão rápida e agir imediatamente' },
      { dimension: 'I', text: 'Conversar com a equipe e gerar novas ideias juntos' },
      { dimension: 'S', text: 'Seguir processos estabelecidos e trabalhar com calma' },
      { dimension: 'C', text: 'Analisar todas as informações antes de decidir' },
    ],
  },
  {
    id: 3,
    text: 'As pessoas ao meu redor me descrevem como alguém:',
    options: [
      { dimension: 'D', text: 'Competitivo e orientado a resultados' },
      { dimension: 'I', text: 'Comunicativo e otimista' },
      { dimension: 'S', text: 'Confiável e de bom relacionamento' },
      { dimension: 'C', text: 'Preciso e organizado' },
    ],
  },
  {
    id: 4,
    text: 'No ambiente de trabalho, o que mais me motiva é:',
    options: [
      { dimension: 'D', text: 'Superar desafios e alcançar metas ambiciosas' },
      { dimension: 'I', text: 'Colaborar com pessoas e criar um clima positivo' },
      { dimension: 'S', text: 'Ter estabilidade e um ambiente harmonioso' },
      { dimension: 'C', text: 'Trabalhar com exatidão e qualidade' },
    ],
  },
]
